var Q = require('q'),
  winston = require('winston'),
  node_redis = require('redis'),
  redisQueue = {},
  client,
  outstandingSubscribeEvents = 0, outstandingUnsubscribeEvents = 0,
  defaultTimeOutMilliseconds = 700;
winston.level = 'info';

var substor = {

  connect: function connect(options) {
    // mandatory attributes are { port: 1234, host: '111.112.44.13'}
    // port is a number
    // host is a string
    // optional attributes are defaultTimeOutMilliseconds and debug}
    // defaultTimeOutMilliseconds is a number and should be provided if the default timeout before checking redis for messages needs to be changed
    // debug should be set to true if additional logging is required

    if (options.hasOwnProperty('defaultTimeOutMilliseconds')
      && Number.isInteger(options.defaultTimeOutMilliseconds)
      && options.defaultTimeOutMilliseconds > 1) {
      defaultTimeOutMilliseconds = options.defaultTimeOutMilliseconds;
    }

    if (options.hasOwnProperty('debug')
      && options.debug === true) {
      winston.level = 'debug';
    }

    winston.log('debug', 'options contains: ' + JSON.stringify(options));

    var deferred = Q.defer();

    if (arguments.length === 1) {
      client = node_redis.createClient(options.port, options.host, {});
      client.on('connect', function () {
        winston.log('debug', 'Connected to Redis server');
        registerEventHandlers();
        deferred.resolve('Connected');
      });
    } else {
      deferred.reject(new Error(arguments.callee.name + "() function should be called with an object with port and host as properties as minimum."));
    }
    return deferred.promise;
  },

  subscribeToChannels: function subscribeToChannels(channels) {
    var deferred = Q.defer();

    if (Array.isArray(channels)) {
      return waitForOutstandingEvents(channels)
        .then(function (result) {
          winston.log('debug', result);

          // Ignore any channels already subscribed to
          var subscribeToChannels = [];
          channels.forEach(function (channel) {
            if (!redisQueue.hasOwnProperty(channel)) {
              redisQueue[channel] = [];
              subscribeToChannels.push(channel);
            }
          });

          if (subscribeToChannels.length > 0) {
            outstandingSubscribeEvents = subscribeToChannels.length;
            client.subscribe.apply(client, subscribeToChannels.concat(function (err, channels) {
              if (err) {
                deferred.reject(err);
              } else {
                deferred.resolve('Subscribed to: ' + channels);
              }
            }));
          } else {
            deferred.resolve('Already subscribed to: ' + channels);
          }
        });
    } else {
      deferred.reject(new Error(arguments.callee.name + "() function should be called with an array as the argument."));
    }

    return deferred.promise;
  },

  unsubscribeFromAllChannels: function unsubscribeFromAllChannels() {
    return waitForOutstandingEvents()
      .then(function (result) {
        winston.log('debug', result);
        var deferred = Q.defer();

        if (Object.keys(redisQueue).length > 0) {
          outstandingUnsubscribeEvents = Object.keys(redisQueue).length;
          Object.keys(redisQueue).forEach(function (channel) {
            delete redisQueue[channel];
          });
          client.unsubscribe(function (err, res) {
            if (err) {
              deferred.reject(err);
            } else {
              deferred.resolve(res);
            }
          });
        } else {
          deferred.resolve('No channels to unsubscribe from, all good!')
        }
        return deferred.promise;
      });
  },

  getQueue: function getQueue() {
    return redisQueue;
  },

  getMessageCount: function getMessageCount(channel) {
    var deferred = Q.defer();

    setTimeout(function () {
      if (redisQueue[channel] === undefined) {
        deferred.reject(new Error('Channel ' + channel + ' has not been subscribed to. Something has gone wrong.'));
      } else {
        deferred.resolve(redisQueue[channel].length);
      }
    }, defaultTimeOutMilliseconds);

    return deferred.promise;
  },

  getLatestMessageOnChannel: function getLatestMessageOnChannel(channel) {
    // returns the latest message on 'channel'

    var deferred = Q.defer();

    setTimeout(function () {
      if (redisQueue[channel] === undefined) {
        deferred.reject(new Error('Channel ' + channel + ' has not been subscribed to. Something has gone wrong.'));
      } else if (redisQueue[channel].length < 1) {
        deferred.reject(new Error('redisQueue[' + channel + '] does not contain any messages.'));
      } else {
        deferred.resolve(redisQueue[channel][redisQueue[channel].length - 1]);
      }
    }, defaultTimeOutMilliseconds);

    return deferred.promise;
  },

  getMessageOnChannel: function getMessageOnChannel(position, channel) {
    var deferred = Q.defer();

    setTimeout(function () {
      if (redisQueue[channel] === undefined) {
        deferred.reject(new Error('Channel ' + channel + ' has not been subscribed to. Something has gone wrong.'));
      } else if (redisQueue[channel].length < 1) {
        deferred.reject(new Error('redisQueue[' + channel + '] does not contain any messages.'));
      } else if (position > redisQueue[channel].length) {
        deferred.reject(new Error('Position is greater than the current queue length of: ' + redisQueue[channel].length));
      } else {
        deferred.resolve(redisQueue[channel][position - 1]);
      }
    }, defaultTimeOutMilliseconds);

    return deferred.promise;
  }
};

function registerEventHandlers() {
  client.on('message', function (channel, message) {
    if (redisQueue[channel] != undefined) {
      redisQueue[channel].push(message);
      if (redisQueue[channel].length > 20) redisQueue[channel].shift();
    }
  });

  client.on('subscribe', function (channel, count) {
    winston.log('debug', 'Subscribe event received for channel: ' + channel);
    if (outstandingSubscribeEvents > 0) outstandingSubscribeEvents = outstandingSubscribeEvents - 1;
    winston.log('debug', 'OutstandingSubscribeEvents: ' + outstandingSubscribeEvents);
  });

  client.on('unsubscribe', function (channel, count) {
    winston.log('debug', 'Unsubscribe event received for channel: ' + channel);
    if (outstandingUnsubscribeEvents > 0) outstandingUnsubscribeEvents = outstandingUnsubscribeEvents - 1;
    winston.log('debug', 'OutstandingUnsubscribeEvents: ' + outstandingUnsubscribeEvents);
  });

  client.on('error', function (error) {
    winston.log('error', error);
    // reset
    redisQueue = {};
    outstandingSubscribeEvents = 0;
    outstandingUnsubscribeEvents = 0;
  });
}

function waitForOutstandingEvents() {
  var runningTotalMilliseconds = 0;
  var millisecondsToWaitUntilQuit = 10000;
  var millisecondsBetweenPolling = 100;
  var deferred = Q.defer();

  var interval = setInterval(function () {
    if (runningTotalMilliseconds > millisecondsToWaitUntilQuit) {
      clearInterval(interval);
      deferred.reject(new Error('There are ' + outstandingSubscribeEvents + '  outstandingSubscribeEvents and ' + outstandingUnsubscribeEvents + ' outstandingUnsubscribeEvents'));
    }

    if (outstandingSubscribeEvents === 0 && outstandingUnsubscribeEvents === 0) {
      clearInterval(interval);
      deferred.resolve('No outstanding events');
    }
    runningTotalMilliseconds = runningTotalMilliseconds + millisecondsBetweenPolling;
  }, millisecondsBetweenPolling);

  return deferred.promise;
}

module.exports = substor;