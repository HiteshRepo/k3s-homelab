FROM golang:1.23-alpine AS builder
WORKDIR /app
COPY go.mod .
COPY main.go .
RUN go build -o brain-capture .

FROM alpine:3.20
WORKDIR /app
COPY --from=builder /app/brain-capture .
EXPOSE 8080
CMD ["./brain-capture"]
