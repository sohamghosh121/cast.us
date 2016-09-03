
var express = require('express');
var app = express();
var url = 'mongodb://localhost:27017/myproject';
var request = require('request');
var FCM = require('fcm-node'); // for notifications
var firebase = require('firebase');

var port = process.env.PORT || 8080;


var serverKey = 'AIzaSyC_XOw3Q6Rp003b-_Td3EL4LIDWXFJzM8A';
var fcm = new FCM(serverKey);
var firebaseApp = firebase.initializeApp({
  apiKey: 'AIzaSyC_XOw3Q6Rp003b-_Td3EL4LIDWXFJzM8A',
  databaseURL: 'https://castus-5d435.firebaseio.com/',
});
var firebaseDb = firebaseApp.database();


// Connection URL
var url = 'mongodb://heroku_vvz02rlh:n2udpq1n4vee6d7t24087cuvpd@ds019796.mlab.com:19796/heroku_vvz02rlh';
// Use connect method to connect to the Server

var monk = require('monk');
var db = monk('localhost:27017/castdotus');

// HTTP requests and API stuff

const API_URL = 'https://graph.facebook.com/v2.7/';

var sendNotification = function(message){
  fcm.send(message, function(err, response){
      if (err) {
          console.log("Something has gone wrong in FCM!");
          console.log(err);
      } else {
          console.log("Successfully sent with response: ", response);
      }
  });
}


var sendRequestStreamNotification = function(requesterDeviceId, requesterName, rmtpUrl, liveVideoId){
  var message = {
      to: requesterDeviceId, // registration token
      collapse_key: 'cast.us',
      notification: {
        title: 'cast.us request',
        body: requesterName + ' wants you to stream to their live video!'
      },
      data: {
        rmtp_url: rmtpUrl, // for android to note whats the rmtp url
        live_video_id: liveVideoId // for server to identify when API call made to confirm ready to stream
      }
  };
  sendNotification(message);
}


var sendStopRequest = function(deviceId){
  var message = {
    to: deviceId,
    data: {
      stop: true
    }
  };
  sendNotification(message)
}

var switchStreamNotification = function(deviceId, toOriginal){ // when notif is received, android stops streaming, does cool UI stuff
  if (toOriginal) {
    body = 'Your friend is ready to stream. Switching to his stream now!'
  } else {
    body = 'The original streamer '
  }
  var message = {
      to: deviceId, // registration token
      collapse_key: 'cast.us',
      notification: {
        title: 'cast.us streaming',
        body: ''
      },
      data: {
        rmtp_url: rmtpUrl, // for android to note whats the rmtp url
        live_video_id: liveVideoId // for server to identify when API call made to confirm ready to stream
      }
  };
  sendNotification(message);
}

// EXPRESS stuff
app.use(function(req,res,next){
    req.db = db;
    next();
});

app.get('/register', function(req, res){
  var userId = req.query.fb_id;
  var deviceId = req.query.device_id;
  var name = req.query.name;
  req.db.insert({
    fbId: userId,
    deviceId: deviceId,
    name: name
  })

});


app.get('/create', function(req, res){
  var userId = req.query.fb_id;
  var accessToken = req.query.access_token;
  var users = req.db.get('users');
  users.update({fbId: userId}, {$set: {accessToken: accessToken}});

  request.post({
    url: API_URL + '/' + userId + '/live_videos',
    body: 'access_token=' + accessToken
  }, function(err, response, body){
    var data = JSON.parse(response.body);
    users.update({fbId: userId}, {$set: {liveVideo: {videoId: data.id, streamUrl: data.stream_url, currentStreamer: userId}}})
      .then(() => { 
        firebaseDb.ref('liveVideos/' + data.id).set({
          currentStreamer: userId,
          acceptedStreamers: []
        });
        users.findOne({fbId: userId}, function(e,h){
          if (e){ res.send({ok: false})}
          else {
            res.send(h.liveVideo);
          }
        });
      });
  });
  

});

// I am original streamer, request switch to my friend
app.get('/request_switch', function(req, res){
  var users = req.db.get('users');
  users.find({fbId: req.query.requestee_fb_id}, function(e, user){ // found the requestee
    users.find({fbId: req.query.fb_id}, function(e, requester){
      // requestee receives notification and Android side does stuff
      sendRequestStreamNotification(user.deviceId, requester.name, requester.liveVideo.streamUrl, requester.liveVideo.videoId);
      // set listener to check when original streaming android has stopped streaming
    });
    
  });
});


app.get('/accept_request', function(req, res){
  var liveVideoId = req.query.live_video_id;
  var newStreamerId = req.query.fb_id;
  firebaseDb.ref('liveVideos/' + liveVideoId).set({'currentStreamer': newStreamerId});
  firebaseDb.ref('liveVideos/' + liveVideoId).push();
});

// I am original streamer, stop my live video, I am done
app.get('/stop_streaming', function(req, res){
  var users = req.db.get('users');
  user = users.find({fb_id: req.query.fb_id}, function(e, user){
  var videoId = user.liveVideo.videoId;
  request.post({
      url: API_URL + '/' + liveVideo + '/end_live_video'
    }, function(error, response, body){
      console.log('stopped streaming live video ' + videoId);
    });
  });
});


app.use(function (req, res) {
  res.send({ msg: "hello" });
});

var server = app.listen(port, function () {
	var host = server.address().address;
	var port = server.address().port;
	console.log("cast.us running at http://%s:%s", host, port)
});



