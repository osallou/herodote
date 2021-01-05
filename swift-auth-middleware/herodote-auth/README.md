# About

Swift auth middleware for herodote (python3 only)


# Install

    pip install -r requirements.txt
    python setup.py install

# Setup

In proxy-server.conf, add herodote-auth filter in pipeline


    pipeline = catch_errors gatekeeper healthcheck proxy-logging cache container_sync bulk tempurl ratelimit crossdomain swift3 herodoteauth authtoken keystoneauth

And add filter section:

    [filter:herodoteauth]
    use = egg:herodote-auth#herodote_auth
    # Secret to decode swift tokens (secrets.swift section of herodote config)
    secret = aSharedSecretWithHerodote
    herodote_url = https://myHerodoteServer
    # Token defined in herodote to allow remote triggering (openstack.swift.tokens section)
    token=myherodotetoken

