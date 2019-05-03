var CONFIG = require('config');
var Promise = require('promise');
var winston = require('winston');
const logger = winston.loggers.get('herodote');

var amqp = require('amqplib');

module.exports = {
    sendMsg: (msg) => {
        return new Promise(function (resolve, reject){
            let conn = null;
            amqp.connect(CONFIG.rabbitmq.url).then(function(_conn) {
                conn = _conn;
                return conn.createChannel();
              }).then(ch => {
                return ch.assertQueue(CONFIG.rabbitmq.queue).then(() => {
                    logger.debug('publish msg');
                    ch.sendToQueue(CONFIG.rabbitmq.queue, Buffer.from(JSON.stringify(msg)))
                    return ch.close()
                })
              })
              .then(() => {
                  conn.close()
                  resolve(true)
              })
    
        });
    }
    
}