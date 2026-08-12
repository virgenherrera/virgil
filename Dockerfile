FROM golang:1.26.5 AS build
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download -x
COPY . .
RUN CGO_ENABLED=0 go build -trimpath -o /virgil ./cmd/virgil

FROM build AS test
RUN go test ./test/app -run '^TestApp_' -v -count=1

FROM scratch
COPY --from=build /virgil /virgil
ENTRYPOINT ["/virgil"]
