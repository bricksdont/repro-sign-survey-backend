FROM alpine:3.19

ARG PB_VERSION=0.39.4

ADD https://github.com/pocketbase/pocketbase/releases/download/v${PB_VERSION}/pocketbase_${PB_VERSION}_linux_amd64.zip /tmp/pb.zip

RUN apk add --no-cache unzip ca-certificates && \
    unzip /tmp/pb.zip pocketbase -d /pb/ && \
    rm /tmp/pb.zip

COPY pb_migrations /pb/pb_migrations

EXPOSE 8090

CMD ["/pb/pocketbase", "serve", "--http=0.0.0.0:8090", "--dir=/pb/pb_data"]
