#!/bin/sh
# install.sh — install the virgil CLI from GitHub Releases.
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/virgenherrera/virgil/main/install.sh | sh
#
# Env vars:
#   VIRGIL_VERSION      Version tag to install (e.g. v0.2.0). Default: latest release.
#   VIRGIL_INSTALL_DIR  Directory to install the binary into. Default: /usr/local/bin
set -eu

REPO="virgenherrera/virgil"
BIN_NAME="virgil"
INSTALL_DIR="${VIRGIL_INSTALL_DIR:-/usr/local/bin}"
VERSION="${VIRGIL_VERSION:-}"

err() {
  echo "error: $1" >&2
  exit 1
}

info() {
  echo "==> $1"
}

need_cmd() {
  command -v "$1" >/dev/null 2>&1 || err "required command '$1' not found in PATH"
}

# --- detect platform -------------------------------------------------------

detect_os() {
  os=$(uname -s)
  case "$os" in
    Linux) echo "linux" ;;
    Darwin) echo "darwin" ;;
    *) err "unsupported platform: $os (virgil only ships prebuilt binaries for Linux and macOS; try 'go install github.com/${REPO}/cmd/virgil@latest' instead)" ;;
  esac
}

detect_arch() {
  arch=$(uname -m)
  case "$arch" in
    x86_64 | amd64) echo "amd64" ;;
    aarch64 | arm64) echo "arm64" ;;
    *) err "unsupported architecture: $arch (supported: x86_64/amd64, aarch64/arm64)" ;;
  esac
}

# --- checksum tool ----------------------------------------------------------

checksum_cmd() {
  if command -v sha256sum >/dev/null 2>&1; then
    echo "sha256sum"
  elif command -v shasum >/dev/null 2>&1; then
    echo "shasum -a 256"
  else
    err "no sha256 tool found (need 'sha256sum' or 'shasum')"
  fi
}

# --- fetch latest version tag ------------------------------------------------

latest_version() {
  api_url="https://api.github.com/repos/${REPO}/releases/latest"
  if command -v curl >/dev/null 2>&1; then
    tag=$(curl -fsSL "$api_url" | grep '"tag_name"' | head -n 1 | cut -d '"' -f 4)
  elif command -v wget >/dev/null 2>&1; then
    tag=$(wget -qO- "$api_url" | grep '"tag_name"' | head -n 1 | cut -d '"' -f 4)
  else
    err "neither curl nor wget found; cannot fetch latest release"
  fi
  [ -n "$tag" ] || err "failed to determine the latest release tag from $api_url"
  echo "$tag"
}

# --- download helper ---------------------------------------------------------

download() {
  url="$1"
  dest="$2"
  if command -v curl >/dev/null 2>&1; then
    curl -fsSL -o "$dest" "$url" || err "failed to download $url"
  elif command -v wget >/dev/null 2>&1; then
    wget -q -O "$dest" "$url" || err "failed to download $url"
  else
    err "neither curl nor wget found; cannot download files"
  fi
}

# --- main ---------------------------------------------------------------------

main() {
  need_cmd uname
  need_cmd tar
  need_cmd grep
  need_cmd cut

  os=$(detect_os)
  arch=$(detect_arch)
  sha_tool=$(checksum_cmd)

  if [ -z "$VERSION" ]; then
    info "resolving latest release for ${REPO}"
    VERSION=$(latest_version)
  fi
  info "installing virgil ${VERSION} (${os}/${arch})"

  if [ "$os" = "windows" ]; then
    ext="zip"
  else
    ext="tar.gz"
  fi

  archive_name="${BIN_NAME}_${os}_${arch}.${ext}"
  base_url="https://github.com/${REPO}/releases/download/${VERSION}"
  archive_url="${base_url}/${archive_name}"
  checksums_url="${base_url}/checksums.txt"

  tmp_dir=$(mktemp -d 2>/dev/null || mktemp -d -t virgil-install)
  trap 'rm -rf "$tmp_dir"' EXIT INT TERM

  archive_path="${tmp_dir}/${archive_name}"
  checksums_path="${tmp_dir}/checksums.txt"

  info "downloading ${archive_url}"
  download "$archive_url" "$archive_path"

  info "downloading checksums.txt"
  download "$checksums_url" "$checksums_path"

  info "verifying checksum"
  expected_line=$(grep "  ${archive_name}\$" "$checksums_path" || grep " \*${archive_name}\$" "$checksums_path" || true)
  [ -n "$expected_line" ] || err "checksum entry for ${archive_name} not found in checksums.txt"

  (
    cd "$tmp_dir"
    echo "$expected_line" | $sha_tool -c - >/dev/null 2>&1
  ) || err "checksum mismatch for ${archive_name} — aborting install (file may be corrupted or tampered with)"

  info "checksum OK"

  info "extracting ${archive_name}"
  case "$ext" in
    tar.gz)
      tar -xzf "$archive_path" -C "$tmp_dir" "$BIN_NAME" || err "failed to extract ${archive_name}"
      ;;
    zip)
      need_cmd unzip
      unzip -q -o "$archive_path" -d "$tmp_dir" "${BIN_NAME}.exe" || err "failed to extract ${archive_name}"
      BIN_NAME="${BIN_NAME}.exe"
      ;;
  esac

  [ -f "${tmp_dir}/${BIN_NAME}" ] || err "extracted binary '${BIN_NAME}' not found in archive"
  chmod +x "${tmp_dir}/${BIN_NAME}"

  if [ ! -d "$INSTALL_DIR" ]; then
    info "creating install directory ${INSTALL_DIR}"
    mkdir -p "$INSTALL_DIR" 2>/dev/null || {
      command -v sudo >/dev/null 2>&1 && sudo mkdir -p "$INSTALL_DIR"
    } || err "failed to create install directory ${INSTALL_DIR}"
  fi

  if [ -w "$INSTALL_DIR" ]; then
    mv "${tmp_dir}/${BIN_NAME}" "${INSTALL_DIR}/${BIN_NAME}"
  elif command -v sudo >/dev/null 2>&1; then
    info "elevated permissions required to write to ${INSTALL_DIR}"
    sudo mv "${tmp_dir}/${BIN_NAME}" "${INSTALL_DIR}/${BIN_NAME}"
  else
    err "no write permission for ${INSTALL_DIR} and 'sudo' is not available; set VIRGIL_INSTALL_DIR to a writable location"
  fi

  info "virgil ${VERSION} installed to ${INSTALL_DIR}/${BIN_NAME}"
  info "run '${BIN_NAME} version' to verify"
}

main "$@"
