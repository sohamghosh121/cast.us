
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
// var url = 'mongodb://heroku_vvz02rlh:n2udpq1n4vee6d7t24087cuvpd@ds019796.mlab.com:19796/heroku_vvz02rlh';
var url = 'localhost:27017/castdotus'
// Use connect method to connect to the Server

var monk = require('monk');
var db = monk(url);

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
  console.log(message);
  sendNotification(message);
}


var sendAcceptedRequestNotification = function(originalDeviceId, accepterName){
  var message = {
    to: originalDeviceId,
    collapse_key: 'cast.us',
    notification: {
      title: 'cast.us request accepted',
      body: accepterName + ' has accepted your accept to stream!'
    }
  }
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

// EXPRESS stuff
app.use(function(req,res,next){
    req.db = db;
    next();
});

app.get('/healthCheck', function(req, res){
  res.send('All good!');
})

app.get('/register', function(req, res){
  var users = req.db.get('users');
  var userId = req.query.fb_id;
  var deviceId = req.query.device_id;
  var name = req.query.name;
  users.insert({
    fbId: userId,
    deviceId: deviceId,
    name: name
  })
  res.send('Registered');
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
    console.log(data);
    users.update({fbId: userId}, {$set: {liveVideo: {videoId: data.id, streamUrl: data.stream_url, currentStreamer: userId, acceptedStreamers: []}}})
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
  // first check if the guy is already in accepted streamers
  var requesteeFbId = String(req.query.requestee_fb_id);
  var fbId = String(req.query.fb_id);
  var users = req.db.get('users');
  var existsQuery = {fbId: fbId};
  var notExistsQuery = {fbId: fbId};
  users.findOne({fbId: fbId}, function(e, user){ // found the requestee
    users.findOne({fbId: fbId, 'liveVideos.acceptedStreamers': {$not: {$elemMatch: {$eq: requesteeFbId}}}}, function(e, requester){
      // requestee receives notification and Android side does stuff
      res.send('Request sent');
      sendRequestStreamNotification(user.deviceId, requester.name, requester.liveVideo.streamUrl, requester.liveVideo.videoId);
    });
    users.find({fbId: fbId, 'liveVideos.acceptedStreamers': requesteeFbId}}}, function(e, requester){
      // if he has already accepted before, change the current streamer in firebase, listener should work
      res.send('Switched stream');
      firebaseDb.ref('liveVideos/' + requester.liveVideo.videoId).set({'currentStreamer': user.fbId});
    });
  });
});


app.get('/accept_request', function(req, res){
  var users = req.db.get('users');
  var liveVideoId = req.query.live_video_id;
  var newStreamerId = req.query.fb_id;
  users.findOneAndUpdate({'liveVideo.videoId': liveVideoId}, {$push: {'liveVideo.acceptedStreamers': newStreamerId}}).then((updatedUser) => {
    users.find({fbId: newStreamerId}, function(e, newUser){
      // sendAcceptedRequestNotification(user.deviceId, newUser.name);
      firebaseDb.ref('liveVideos/' + liveVideoId).set({'currentStreamer': newStreamerId});
      res.send('ok'); // the accepted gets this
    });
  });
  
});

// I am original streamer, stop my live video, I am done
app.get('/stop_streaming', function(req, res){
  var users = req.db.get('users');
  user = users.find({fb_id: req.query.fb_id}, function(e, user){
  var videoId = user.liveVideo.videoId;
  request.post({
      url: API_URL + '/' + liveVideo + '/end_live_video'
    }, function(error, response, body){
      if (error){
        res.send(error);
      } else {
        console.log('stopped streaming live video ' + videoId);
        res.send('stopped streaming live video ' + videoId)
      }
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



