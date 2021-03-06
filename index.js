/**
 * Load Modules
 */
var http = require('http'),
  request = require('request'),
  fs = require('fs'),
  events = require('events'),
  emitter = new events.EventEmitter(),
  Notification = require('node-notifier'),
  Slack = require('node-slack'),
  slack = false
;

/**
 * Local Variables
 */
var options = {
    url:    'http://sirocco.accuweather.com/adc_images2/english/feature/400x300/worstwx.jpg',
    log:    __dirname + '/last-modified.txt',
    images: __dirname + '/images',
    slack:  __dirname + '/slack.json'
  },
  config = {}
;

/**
 * Enable Slack
 */
fs.exists(options.slack, function(exists) {
  if ( ! exists ) return;

  config = require(options.slack);
  slack = new Slack(config.webhook);
});

/**
 * Local Last Modified Time
 */
function getLocalModified() {
  fs.exists(options.log, function(exists) {
    if ( ! exists ) {
      emitter.emit('localModified', exists);
      return;
    }

    fs.readFile(options.log, 'utf8', function(error, data) {
      if (error) {
        return console.log(error);
      }

      emitter.emit('localModified', data);
    });
  });
}

/**
 * Remote Last Modified Time
 *
 * @param string|bool modified
 */
emitter.on('localModified', function(modified) {
  http.get(options.url, function(response) {
    if ( modified === response.headers['last-modified'] ) return;

    writeImage(response);
    updateLocal(response.headers['last-modified']);
  }).on('error', function(error) {
    console.log(error);
  });
});

/**
 * Update Local Last Modified
 *
 * @param string modified
 */
function updateLocal(modified) {
  fs.writeFile(options.log, modified, function(error) {
    if (error) return console.log(error);
  });
}

/**
 * Write Remote Image to Local Directory
 *
 * @param object response
 */
function writeImage(response) {
  var imagedata = '',
    now = new Date(),
    filename = now.getFullYear() + '_' + (now.getMonth() + 1) + '_' + now.getDate() + '.jpg'
  ;

  if ( ! fs.existsSync(options.images) ) {
    fs.mkdirSync(options.images);
  }

  response.setEncoding('binary');

  response.on('data', function(chunk) {
    imagedata += chunk;
  });

  response.on('end', function() {
    fs.writeFile(options.images + '/' + filename, imagedata, 'binary', function(error){
      if (error) return console.log(error);

      emitter.emit('newImage', options.images + '/' + filename);
    });
  });
}

/**
 * Send Desktop Notification
 *
 * @param string image
 */
function sendNotification(image) {
  var notifier = new Notification();

  notifier.notify({
    title:       'AccuWeather',
    message:     'Today’s Worst Weather',
    contentImage: image,
    appIcon:      __dirname + '/accuweather.png',
    open:         'file://' + image
  });
}

/**
 * Send Slack Message
 *
 * @param string image
 */
function sendSlack(image) {
  if (!slack) return;

  if (!config.token) {
    emitter.emit('slackMessage', options.url);
    return;
  }

  var data = {
    channels: config.channel,
    token   : config.token,
    file    : fs.createReadStream(image)
  };

  request.post({url: 'https://slack.com/api/files.upload', formData: data}, function(err, res, body) {
    if (err) return console.log(err);

    var data = JSON.parse(body);

    emitter.emit('slackMessage', data.file.url);
  });
}

emitter.on('slackMessage', function(url) {
  slack.send({
    text        : 'Today’s Worst Weather ' + url,
    channel     : config.channel,
    username    : 'AccuWeather',
    icon_emoji  : ':sunny:',
    unfurl_links: true
  }, function(error, response) {
    if (error) console.log(error);
  });
});

/**
 * New Image Listeners
 */
emitter.on('newImage', function(image) {
  sendNotification(image);
  sendSlack(image);
});

/**
 * Init
 */
getLocalModified();