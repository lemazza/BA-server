'use strict';
const express = require('express');
const config = require('./config');
const bodyParser = require('body-parser');
const {Game} = require('./models');

const router = express.Router();

router.use(bodyParser.json());

router.post('/', (req, res, next) => {
  Game
  .create({
    players: [{name: req.body.userId}],
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

router.get('/:gameId', (req, res, next) => {
  Game
  .findById(req.params.gameId)
  .then(game=> {
    console.log(game);
    return res.status(200).json(game.serialize());
  })
})






module.exports = {router};