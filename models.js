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
    creator: {type: Boolean, default: false},
    controller: {type: String, default: 'none'},
    name: String,
    hand: {type: Array, default: ['goodCard', 'goodCard', 'goodCard', 'badCard']},
    stack: [String],
    revealed: [String],
    roundsWon: {type:Number, default: 0},
    bid: {type:Number, default: 0},
    passed: {type: Boolean, default: false},
    loggedIn: Boolean,
  }],
  playerOrder: [Number],
  numHumans: {type: Number, default: 1, min:1, max: 6},
  numBots: {type: Number, default: 0, min:0, max:5},
  round: {type: Number, default: 0},
  phase: {type: String, default: 'waiting for players'},
  turn: {type: Number, default: 0},
  highBid: {type: Number, default: 0},
  startPlayer: {type: Number, default:0},
  chat: [{
    sender: String,
    text: String,
  }],
});

gameSchema.methods.serialize = function() {
  let playersDisplay = this.players.map((player, index)=>{
    let active = (index === this.playerOrder[this.turn])? true : false;
    return {
      active,
      creator: player.creator,
      name: player.name,
      controller: player.controller,
      hand: player.hand.length,
      stack: player.stack.length,
      revealed: player.revealed,
      roundsWon: player.roundsWon,
      bid: player.bid,
      passed: player.passed,
      loggedIn: player.loggedIn,
    }
  })
  return {
    gameId: this._id,
    players: playersDisplay,
    playerOrder: this.playerOrder,
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