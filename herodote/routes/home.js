var express = require('express');
var router = express.Router();
var CONFIG = require('config');

router.get('/', function(req, res, next) {
    res.redirect(CONFIG.herodote.public_href+'/ui/');  
});

module.exports = router;
