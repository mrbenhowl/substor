substor
=======

Node.js promise based utility to subscribe to one or more Redis channels at a time and store all messages received on subscribed channels. Messages can then be inspected.

I use my other npm module [messageCheckr](https://github.com/mrbenhowl/messageCheckr) with substor to verify JMS / SOAP are correct. substor is used on my work projects to verify integration messages from both UI tests using Cucumber/Protractor and API tests using mocha/supertest.

Compatibility
------------

Works with Node.js v0.12.* and higher

Getting Started
---------------

`npm install substor` to install from the [NPM registry](https://www.npmjs.com/package/substor).

Install
-------

```javascript
var substor = require('substor');
```

Usage
-----

The following example is how I have used substor in an API test using mocha.

In hook.js

```javascript
before(function () {
  return substor.connect({host: 'redisHost', port: 'redisPort'});
});
```

In testFile.js

```javascript
it('should do something', function () {

  return substore.subscribeToChannels(['redisChannelName'])
    .then(function(){
      // Do something that results in a message or messages to be placed on Redis channel 'redisChannelName'
    })
    .then(function(){
      return substore.getLatestMessageOnChannel('redisChannelName')
    })
    .then(function(latestMessageOnRedisChannelName){
      // latestMessageOnRedisChannelName is a String
      // Do whatever you want to the message.
      // Once done ensure to unsubscribe from the Redis channel(s)
      return substore.unsubscribeFromAllChannels()
    })
});
```

Methods
-------

All promises returned from methods are Promises/A+ compliant. Underneath the hood [q](https://github.com/kriskowal/q) is used. 

### connect(options)

| Param | Type | Description |
|:--|:--|:--|
|options | object | *Attributes* <br />**host** - (mandatory) Redis host (e.g. host: '127.0.0.1') <br />**port** - (mandatory) Redis port (e.g. port: '6379') <br />**defaultTimeOutMilliseconds** - (optional) an integer to override the default of 700 milliseconds. This value is the wait time before getting a message (or message count) from a subscribed channel. <br />**debug** - (optional) set to true if you need to see more logs.|

**Returns** Promise.

### subscribeToChannels(channels)

| Param | Type | Description |
|:--|:--|:--|
| channels | Array | An array of Redis channels. Each element is a String, e.g. ['channel1', 'channel2'] |

**Returns** Promise.

### unsubscribeFromAllChannels()

**Returns** Promise. 

### getQueue()
**Returns** object consisting of all messages received on all channels subscribed to. 

### getMessageCount(channel)

| Param | Type | Description |
|:--|:--|:--|
| channel | String | Name of channel |

**Returns** Promise that resolves to the number of messages received on the specified **channel** since it was subscribed to. 

### getLatestMessageOnChannel(channel)

| Param | Type | Description |
|:--|:--|:--|
| channel | String | Name of channel |

**Returns** Promise that resolves to the message (String) last received on the specified **channel**.

### getMessageOnChannel(position, channel)

| Param | Type | Description |
|:--|:--|:--|
| position | Integer | Position of message received, 1 being the latest |
| channel | String | Name of channel |

**Returns** Promise that resolves to the the message (String) in **position** on the specified **channel**.
