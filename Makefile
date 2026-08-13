GO_IMAGE        := golang:1.26.5
GORELEASER_IMAGE := goreleaser/goreleaser:latest
BINARY          := virgil
MOUNT           := -v $(CURDIR):/src -w /src

.PHONY: deps build test lint clean release-dry-run

deps:
	docker run --rm $(MOUNT) $(GO_IMAGE) go mod tidy
	@echo "go.sum generated — commit it."

build:
	docker build --target build -t $(BINARY):build .

test:
	docker build --target test -t $(BINARY):test .

lint:
	docker run --rm $(MOUNT) $(GO_IMAGE) sh -c 'go vet ./... && gofmt -l .'

clean:
	docker rmi -f $(BINARY):build $(BINARY):test 2>/dev/null || true

release-dry-run:
	docker run --rm $(MOUNT) $(GORELEASER_IMAGE) release --snapshot --clean --skip=publish
