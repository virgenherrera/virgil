package evidence

import (
	"errors"
	"fmt"
	"io/fs"
	"os"
	"path"
	"path/filepath"
	"runtime"
	"sort"
	"strings"
)

func resolveRealDirectory(value, label string) (string, error) {
	if !filepath.IsAbs(value) {
		return "", fmt.Errorf("%s must be absolute", label)
	}
	cleaned := filepath.Clean(value)
	info, err := os.Lstat(cleaned)
	if err != nil || !info.IsDir() || info.Mode()&os.ModeSymlink != 0 {
		return "", fmt.Errorf("%s must be an existing non-symlink directory", label)
	}
	resolved, err := filepath.EvalSymlinks(cleaned)
	if err != nil || !filepath.IsAbs(resolved) {
		return "", fmt.Errorf("%s cannot be canonically resolved", label)
	}
	resolvedInfo, err := os.Lstat(resolved)
	if err != nil || !resolvedInfo.IsDir() || resolvedInfo.Mode()&os.ModeSymlink != 0 {
		return "", fmt.Errorf("resolved %s must be a real directory", label)
	}
	return filepath.Clean(resolved), nil
}

func pathsOverlap(left, right string) bool {
	return left == right || pathWithin(left, right) || pathWithin(right, left)
}

func supportedUnix() bool {
	switch runtime.GOOS {
	case "aix", "android", "darwin", "dragonfly", "freebsd", "hurd", "illumos", "ios", "linux", "netbsd", "openbsd", "solaris":
		return true
	default:
		return false
	}
}

func (publisher *Publisher) publish(bundle preparedBundle) error {
	if !supportedUnix() {
		return fmt.Errorf("evidence publication is unsupported on %s: Unix directory rename and fsync are required", runtime.GOOS)
	}
	root, err := os.OpenRoot(publisher.evidenceRoot)
	if err != nil {
		return fmt.Errorf("open explicit evidence root: %w", err)
	}
	defer root.Close()
	openedInfo, openedErr := root.Stat(".")
	currentInfo, currentErr := os.Lstat(publisher.evidenceRoot)
	if openedErr != nil || currentErr != nil || currentInfo.Mode()&os.ModeSymlink != 0 ||
		!currentInfo.IsDir() || !os.SameFile(openedInfo, currentInfo) {
		return fmt.Errorf("explicit evidence root changed before publication: %w", errors.Join(openedErr, currentErr))
	}

	finalName := filepath.Base(bundle.layout.BundleRoot)
	if err := validateID(finalName, "bundle directory"); err != nil {
		return err
	}
	stagingName := ".staging-" + finalName
	if err := requireAbsent(root, finalName, "final evidence bundle"); err != nil {
		return err
	}
	if err := requireStagingAbsent(root, stagingName); err != nil {
		return err
	}
	if err := root.Mkdir(stagingName, 0o700); err != nil {
		return fmt.Errorf("create exclusive evidence staging directory: %w", err)
	}
	published := false
	defer func() {
		if !published {
			_ = root.RemoveAll(stagingName)
		}
	}()
	if err := chmodDirectory(root, stagingName); err != nil {
		return err
	}

	directories := requiredDirectories(bundle.files)
	for _, directory := range directories {
		relative := path.Join(stagingName, directory)
		if err := root.Mkdir(relative, 0o700); err != nil {
			return fmt.Errorf("create evidence directory %s: %w", directory, err)
		}
		if err := chmodDirectory(root, relative); err != nil {
			return err
		}
	}
	for _, file := range bundle.files {
		if file.relative == manifestFile {
			return fmt.Errorf("manifest must not be included among pre-publication resources")
		}
		if err := writeExclusive(root, path.Join(stagingName, file.relative), file.content); err != nil {
			return err
		}
	}
	for index := len(directories) - 1; index >= 0; index-- {
		if err := syncDirectory(root, path.Join(stagingName, directories[index])); err != nil {
			return err
		}
	}
	if err := syncDirectory(root, stagingName); err != nil {
		return err
	}

	// manifest.json is intentionally the last staged file. Until it is durable,
	// the directory cannot be interpreted as an authoritative bundle.
	if err := writeExclusive(root, path.Join(stagingName, manifestFile), bundle.manifest); err != nil {
		return err
	}
	if err := syncDirectory(root, stagingName); err != nil {
		return err
	}
	// Prove parent-directory fsync support before making the manifest-bearing
	// directory visible at its final name.
	if err := syncDirectory(root, "."); err != nil {
		return err
	}
	if err := requireAbsent(root, finalName, "final evidence bundle"); err != nil {
		return err
	}
	if err := root.Rename(stagingName, finalName); err != nil {
		return fmt.Errorf("atomically publish evidence directory without replacement: %w", err)
	}
	published = true
	if err := syncDirectory(root, "."); err != nil {
		// Remove the authority marker before best-effort cleanup. Publish returns no
		// reference, so a failed durability boundary cannot be certified.
		cleanupErr := invalidatePublished(root, finalName)
		if cleanupErr != nil {
			return fmt.Errorf("durably publish evidence directory: %w; authority invalidation also failed: %v", err, cleanupErr)
		}
		return fmt.Errorf("durably publish evidence directory: %w", err)
	}
	return nil
}

func requireStagingAbsent(root *os.Root, relative string) error {
	_, err := root.Lstat(relative)
	if errors.Is(err, fs.ErrNotExist) {
		return nil
	}
	if err != nil {
		return fmt.Errorf("inspect evidence staging directory: %w", err)
	}
	return &StagingConflictError{Path: relative}
}

func requireAbsent(root *os.Root, relative, label string) error {
	_, err := root.Lstat(relative)
	if errors.Is(err, fs.ErrNotExist) {
		return nil
	}
	if err != nil {
		return fmt.Errorf("inspect %s: %w", label, err)
	}
	return fmt.Errorf("%s already exists; evidence publication never overwrites", label)
}

func requiredDirectories(files []preparedFile) []string {
	seen := make(map[string]struct{})
	for _, file := range files {
		directory := path.Dir(file.relative)
		if directory != "." {
			seen[directory] = struct{}{}
		}
	}
	directories := make([]string, 0, len(seen))
	for directory := range seen {
		directories = append(directories, directory)
	}
	// Paths are currently one level deep. Sorting by slash count first keeps
	// this safe if a future schema adds nested deterministic resource classes.
	sortPaths(directories)
	return directories
}

func sortPaths(paths []string) {
	sort.Slice(paths, func(left, right int) bool {
		leftDepth := strings.Count(paths[left], "/")
		rightDepth := strings.Count(paths[right], "/")
		if leftDepth != rightDepth {
			return leftDepth < rightDepth
		}
		return paths[left] < paths[right]
	})
}

func writeExclusive(root *os.Root, relative string, content []byte) error {
	file, err := root.OpenFile(relative, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0o600)
	if err != nil {
		return fmt.Errorf("create exclusive evidence resource %s: %w", relative, err)
	}
	if err = file.Chmod(0o600); err == nil {
		_, err = file.Write(content)
	}
	if err == nil {
		err = file.Sync()
	}
	closeErr := file.Close()
	if err != nil {
		return fmt.Errorf("durably write evidence resource %s: %w", relative, err)
	}
	if closeErr != nil {
		return fmt.Errorf("close evidence resource %s: %w", relative, closeErr)
	}
	return nil
}

func chmodDirectory(root *os.Root, relative string) error {
	directory, err := root.Open(relative)
	if err != nil {
		return fmt.Errorf("open evidence directory %s: %w", relative, err)
	}
	err = directory.Chmod(0o700)
	closeErr := directory.Close()
	if err != nil {
		return fmt.Errorf("set evidence directory mode %s: %w", relative, err)
	}
	if closeErr != nil {
		return fmt.Errorf("close evidence directory %s: %w", relative, closeErr)
	}
	return nil
}

func syncDirectory(root *os.Root, relative string) error {
	directory, err := root.Open(relative)
	if err != nil {
		return fmt.Errorf("open evidence directory %s for sync: %w", relative, err)
	}
	err = directory.Sync()
	closeErr := directory.Close()
	if err != nil {
		return fmt.Errorf("filesystem cannot durably sync evidence directory %s: %w", relative, err)
	}
	if closeErr != nil {
		return fmt.Errorf("close synced evidence directory %s: %w", relative, closeErr)
	}
	return nil
}

func invalidatePublished(root *os.Root, finalName string) error {
	if err := root.Remove(path.Join(finalName, manifestFile)); err != nil {
		return fmt.Errorf("remove evidence authority marker: %w", err)
	}
	if err := syncDirectory(root, finalName); err != nil {
		return fmt.Errorf("sync invalidated evidence directory: %w", err)
	}
	failedName := ".failed-" + finalName
	if err := requireAbsent(root, failedName, "failed evidence cleanup directory"); err == nil {
		if err := root.Rename(finalName, failedName); err == nil {
			_ = root.RemoveAll(failedName)
			_ = syncDirectory(root, ".")
			return nil
		}
	}
	if err := root.RemoveAll(finalName); err != nil {
		return fmt.Errorf("remove invalidated evidence directory: %w", err)
	}
	if err := syncDirectory(root, "."); err != nil {
		return fmt.Errorf("sync evidence root after invalidation: %w", err)
	}
	return nil
}
