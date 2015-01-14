var express = require('express');
var util = require('./lib/utility');
var partials = require('express-partials');
var bodyParser = require('body-parser');
var bcrypt = require('bcrypt-nodejs');


var db = require('./app/config');
var Users = require('./app/collections/users');
var User = require('./app/models/user');
var Links = require('./app/collections/links');
var Link = require('./app/models/link');
var Click = require('./app/models/click');
var session = require('express-session');
var app = express();

app.set('views', __dirname + '/views');
app.set('view engine', 'ejs');
app.use(partials());
app.use(session({secret: '888'}));
// Parse JSON (uniform resource locators)
app.use(bodyParser.json());
// Parse forms (signup/login)
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(__dirname + '/public'));

var sess;

app.get('/',
  function(req, res) {
  sess = req.session;
  if (!sess.username){
    res.redirect('/login');
  }
  res.render('index');

});

app.get('/create',
  function(req, res) {
    res.redirect('/');
  });

app.get('/login',
  function(req, res) {
    res.render('login');
  });

app.get('/signup',
  function(req, res) {
    res.render('signup');
  });

app.get('/links',
  function(req, res) {
    sess = req.session;
    if (!sess.username){
      res.redirect('/');
    }
    Links.reset().fetch().then(function(links) {
      res.send(200, links.models);
    });
  });

app.post('/links',
  function(req, res) {
    console.log(sess.username);
    if (!sess.username){
      res.redirect('/');
    }

    var uri = req.body.url;

    if (!util.isValidUrl(uri)) {
      console.log('Not a valid url: ', uri);
      return res.send(404);
    }

    new Link({ url: uri }).fetch().then(function(found) {
      if (found) {
        console.log(found);
        res.send(200, found.attributes);
      } else {
        util.getUrlTitle(uri, function(err, title) {
          if (err) {
            console.log('Error reading URL heading: ', err);
            return res.send(404);
          }

          var link = new Link({
            url: uri,
            title: title,
            base_url: req.headers.origin
          });

          link.save().then(function(newLink) {
            Links.add(newLink);
            res.send(200, newLink);
          });
        });
      }
    });
  });

app.post('/login',function(req,res){
  // If username doesn't exist, prompt 'no user by that name'
  sess = req.session;
  var username = req.body.username;
  var password = req.body.password;

  new User({ username: username}).fetch().then(function(user){
    if (!user){
      res.redirect('signup');
    }
    bcrypt.compare(password, user.get('hash'), function(err, match){
      if(match){
        sess.username = username;
        sess.cookie.originalMaxAge = 5000;
        // If username & password correct 'route to all links'
        res.render('index');
        // If wrong password 'Password incorrect'
      } else {
        res.redirect('/login');
      }
    })
  });


});

app.post('/signup',function(req,res){
  var username = req.body.username;
  var password = req.body.password;
  var hashed;

  // If username exists, return prompt 'username exists', then route to login
  new User({ username: username }).fetch().then(function(user){
    if (user.attributes.username){
      res.redirect('login');
  // if username does not exist, store the username and password into the database
    } else {
      bcrypt.hash(password, null, null, function(err, hash){
        Users.create({
          username: username,
          hash: hash
        }).then(function(newUser){
          Users.add(newUser);
          res.send(200, newUser);
        });
      });
    }
  });
});

/************************************************************/
// Write your authentication routes here
/************************************************************/



/************************************************************/
// Handle the wildcard route last - if all other routes fail
// assume the route is a short code and try and handle it here.
// If the short-code doesn't exist, send the user to '/'
/************************************************************/

app.get('/*', function(req, res) {
  new Link({ code: req.params[0] }).fetch().then(function(link) {
    if (!link) {
      res.redirect('/');
    } else {
      var click = new Click({
        link_id: link.get('id')
      });

      click.save().then(function() {
        db.knex('urls')
        .where('code', '=', link.get('code'))
        .update({
          visits: link.get('visits') + 1,
        }).then(function() {
          return res.redirect(link.get('url'));
        });
      });
    }
  });
});

console.log('Shortly is listening on 4568');
app.listen(4568);
