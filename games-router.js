'use strict';
const express = require('express');
const config = require('./config');
const bodyParser = require('body-parser');
const {Game} = require('./models');
const passport = require('passport');
const router = express.Router();
const {jwtStrategy} = require('./auth/strategies');
const {createHumanPlayer} = require('./utils');

const jwtAuth = passport.authenticate('jwt', { session: false });


router.use(bodyParser.json());

router.post('/', jwtAuth, (req, res, next) => {
  const {id: userId, username} = req.user;
  let player = createHumanPlayer(userId, username, true)
  // TODO: put function here to create bots, add to players
  Game
  .create({
    players: [player],
    numHumans: req.body.humans,
    numBots: req.body.bots,
  })
  .then(game=>{
    res.status(201).json(game.serialize());
  })
  .catch(e=>{
    res.status(400).json(e);
  })
})

router.get('/:gameId', jwtAuth, (req, res, next) => {
  // extract userId from req
  const {id: userId, username} = req.user;
  Game
  .findById(req.params.gameId)
  .then(game=> {
    let {players, numHumans, numBots} = game;
    let userControlledPlayer = players.find(player=> (player.controller === userId));

    if (userControlledPlayer) {
      // find if the user has controls a player, return current game state
      let resObj = Object.assign({}, game.serialize(), {userPlayer: userControlledPlayer});
      return res.status(200).json(resObj);
    } 
    else if ((players.length - numBots) >= numHumans) {
      // if there are already the right number of human players, the game is full, can't join
      return res.status(400).json({error: 'Error: game full'})
    } 
    else {
      // give user control of new player in game
      let player = createHumanPlayer(userId, username, false)
      Game
      .findByIdAndUpdate({_id: req.params.gameId}, {$push: {players: player}})
      .then(game=> {
        let resObj = Object.assign({}, game.serialize(), {userPlayer: player})
        return res.status(200).json(resObj);
      })
    }
  })
})






module.exports = {router};