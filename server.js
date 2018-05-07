const express = require('express');
const morgan = require('morgan');
const mongoose = require('mongoose');
const passport = require('passport');
const bodyParser = require('body-parser');
const {createAuthToken} = require('./auth/router')
const {Game, User} = require('./models');

const {router: gamesRouter} = require('./games-router')
const {router: authRouter} = require('./auth');

require('dotenv').config();
const { DATABASE_URL, PORT } = require('./config');

const app = express();

app.use(morgan('common'));
app.use(bodyParser.json());


//  https://sleepy-bhaskara-1d8eae.netlify.com
app.use(function(req, res, next) {
  res.header("Access-Control-Allow-Origin", '*');
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Authorization, Content-Type, Accept");
  next();
});


app.use('/api/auth', authRouter);
app.use('/games', gamesRouter);


app.get('/', function (req, res, next) {
  res.send('Hellloooo');
});

app.post('/users', function(req, res, next) {
  const requiredFields = ['username', 'password'];
  for (let i = 0; i < requiredFields.length; i++) {
    const field = requiredFields[i];
    if (!(field in req.body)) {
      const message = `Missing \`${field}\` in request body`;
      console.error(message);
      return res.status(400).send(message);
    }
  }
  let {username, firstName, lastName, email, password} = req.body;

  return User.find({username})
    .count()
    .then(count => {
      if (count > 0) {
        // There is an existing user with the same userName
        return Promise.reject({
          code: 422,
          reason: 'ValidationError',
          message: 'userName already taken',
          location: 'userName'
        });
      }
      // If there is no existing user, hash the password
      return User.hashPassword(password);
    })
    .then(hash => {
      return User.create({
        username: req.body.username,
        password: hash,
        firstName: req.body.firstName,
        lastName: req.body.lastName,
        email: req.body.email
      });
    })
    .then(user => {
      let output = user.serialize();
      output.authToken = createAuthToken(req.body);//change req.body to user??
      return res.status(201).json(output);
    })
    .catch(err => {
      // Forward validation errors on to the client, otherwise give a 500
      // error because something unexpected has happened
      if (err.reason === 'ValidationError') {
        return res.status(err.code).json(err);
      }
      res.status(500).json({code: 500, message: 'Internal server error'});
    });
})











function runServer(databaseUrl, port = PORT) {
  return new Promise((resolve, reject) => {
    mongoose.connect(databaseUrl, err => {
      if (err) {
        return reject(err);
      }
      server = app.listen(port, () => {
        console.log(`Your app is listening on port ${port}`);
        resolve();
      })
        .on('error', err => {
          mongoose.disconnect();
          reject(err);
        });
    });
  });
}


function closeServer() {
  return mongoose.disconnect().then(() => {
    return new Promise((resolve, reject) => {
      console.log('Closing server');
      server.close(err => {
        if (err) {
          return reject(err);
        }
        resolve();
      });
    });
  });
}


if (require.main === module) {
  runServer(DATABASE_URL).catch(err => console.error(err));
}


module.exports = { runServer, app, closeServer };