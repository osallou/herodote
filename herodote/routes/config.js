var express = require('express');
var router = express.Router();
var CONFIG = require('config');

router.get('/', function(req, res, next) {
  res.send({'config': {
    'swift_url': CONFIG.openstack.swift.url,
    'executors': CONFIG.herodote.executors,
    'support': CONFIG.herodote.support,
    'privacy_url': CONFIG.herodote.privacy_url,
    'operator': CONFIG.herodote.operator,
    'oidc': CONFIG.oidc.issuer ? true : false
  }})
  res.end()
});

module.exports = router;
