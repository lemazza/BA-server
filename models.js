'use strict';

const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

mongoose.Promise = global.Promise;

const ObjectId = mongoose.Schema.Types.ObjectId;

/**
  * USERS
  */

const userSchema = mongoose.Schema({
  email: {type: String},
  password: {type: String, required: true},
  username: {type: String, required: true, unique: true},
  firstName: {type: String, default: ""},
  lastName: {type: String, default: ""},
})

userSchema.methods.serialize = function() {
  return {
    id: this._id,
    username: this.username,
    name: this.firstname,
  }
}

userSchema.methods.validatePassword = function(password) {
  return bcrypt.compare(password, this.password);
};

userSchema.statics.hashPassword = function(password) {
  return bcrypt.hash(password, 10);
};


/**
  * GAMES
  */

const gameSchema = mongoose.Schema({
  players: [{
    name: String,
    hand: {type: Array, default: ['goodCard', 'goodCard', 'goodCard', 'badCard']},
    stack: [String],
    roundsWon: {type:Number, default: 0},
    bid: {type:Number, default: 0},
    active: Boolean,
    passed: Boolean,
  }],
  numHumans: {type: Number, default: 1, min:1, max: 6},
  numBots: {type: Number, default: 0, min:0, max:5},
  round: {type: Number, default: 0},
  phase: {type: String, default: 'waiting to start'},
  turn: {type: Number, default: 0},
  highBid: {type: Number, default: 0},
  startPlayer: {type: Number, default:0},
  chat: [{
    sender: String,
    text: String,
  }],
});

gameSchema.methods.serialize = function() {
  let playersDisplay = this.players.map(player=>{
    return {
      name: player.name,
      hand: player.hand.length,
      stack: player.stack.length,
      roundsWon: player.roundsWon,
      bid: player.bid,
      active: player.active,
      passed: player.passed,
    }
  })
  return {
    id: this._id,
    players: playersDisplay,
    numBots: this.numBots,
    numHumans: this.numHumans,
    round: this.round,
    phase: this.phase,
    turn: this.turn,
    highBid: this.highBid,
    startPlayer: this.startPlayer,
    chat: this.chat,
  }
}

const Game = mongoose.model('Game', gameSchema);
const User = mongoose.model('User', userSchema);

module.exports = {Game, User};