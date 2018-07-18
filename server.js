const express = require('express');
const morgan = require('morgan');
const mongoose = require('mongoose');
const passport = require('passport');
const bodyParser = require('body-parser');
const {createAuthToken} = require('./auth/router')
const {Game, User} = require('./models');
const config = require('./config');
const {updateGameAndSendRes, setStartGameOrder, setNextPlayerTurn, shuffle} = require('./utils');

const {returnRouter} = require('./games-router')
const {router: authRouter} = require('./auth');

require('dotenv').config();
const { DATABASE_URL, PORT } = require('./config');

const app = express();
var http = require('http').Server(app);
var io = require('socket.io')(http);
var socketioJwt   = require("socketio-jwt");


const jwtAuth = passport.authenticate('jwt', { session: false });

app.use(morgan('common'));
app.use(bodyParser.json());

//'http://localhost:3000'
//  https://bad-apples.netlify.com
app.use(function(req, res, next) {
  res.header("Access-Control-Allow-Origin", '*');
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Authorization, Content-Type, Accept");
  res.header("Access-Control-Allow-Credentials", true);
  next();
});


app.use('/api/auth', authRouter);
app.use('/games', returnRouter(io));


app.get('/', function (req, res, next) {
  res.send('Hellloooo');
});

/*
 *
 *   Io stuff
 *
 */

let gameSocket = io.of('/games');

gameSocket.use(socketioJwt.authorize({
  secret: config.JWT_SECRET,
  handshake: true
}));

gameSocket.on('connection', function(socket) {
  let {id: userId, username} = socket.decoded_token.user;
  console.log('new connection', socket.id,  socket.decoded_token.sub);
  
  socket.on('join game', function(gameId) {
    console.log('gameId request is', gameId);
    socket.join(gameId);
    gameSocket.in(gameId).emit('get update');
    });

  socket.on('request update', function(gameId) {
    console.log('requested update from', username);
    Game
    .findById(gameId)
    .then(game=> {
      let userPlayer = game.players.find(player=> (player.controller === userId));
      let resObj = Object.assign({}, game.serialize(), {userPlayer})
      socket.emit('update game', resObj);
    })
  })

  socket.on('start game', function(gameId) {
  // check if user is in players and is the game creator
  // check if all players have signed in
    Game
    .findById(gameId)
    .then(game=> {
      if(!game) {
        return socket.emit('error', {error: 'not a valid gameId', location: 'start'});
      }
      const player = game.players.find(plyr=> plyr.controller === userId && plyr.creator);
      if(!player) {
        return socket.emit('error', {error: "user does not exist in players or isn't creator", location: 'start'});
      }
      if (game.players.length !== (game.numBots + game.numHumans)) {
        return socket.emit('error', {error: 'not all players have signed in', location:'start'});
      }

      //set order of players around table
      const {players, playerOrder, startPlayer, turn} = setStartGameOrder(game);
      Game
      .findByIdAndUpdate(
        gameId, 
        {$set: {players, startPlayer, playerOrder, turn, round: 1, phase: 'place first card'}},
        {new: true}
      )
      .then(game=> {
        if(!game) {
          return socket.emit('error', {error: 'problem setting up game order', location: 'start: setStartGameOrder'});
        }
        console.log('made it here, game should start');
        return gameSocket.in(gameId).emit('get update');
      });
    });
});

  socket.on('place card', function(gameId, cardType) {
    console.log('gameId is ', gameId)
    Game
    .findById(gameId)
    .then(game=> {
      if(!game) {
        socket.emit('error', {error: 'not a valid gameId', location: 'place'});
      }

      console.log('card placed, in game phase: ', game.phase);
      if(!(game.phase === 'place first card' || game.phase === 'place or bid')) {
        console.log("can't place a card right now");
        socket.emit('error', {error: 'cannot place card in this phase', location: 'place'});
      }

      const gameUpdates = {};
      let playerIndex;

      //make sure the player exists and it is their turn
      let activePlyr = game.playerOrder[game.turn];
      const player = game.players.find((plyr, index) => {
        if(plyr.controller === userId && index === activePlyr) {
          playerIndex = index;
          return true;
        } else { 
          return false; 
        }
      });
      if(!player) {
        console.log('player is wrong for some reason');
        socket.emit('error', {error: "user does not exist in players or (more likely) it isn't their turn", location: 'place'});
      }

      // if cardtype is in hand, remove from hand, add to stack 
      const cardIndex = player.hand.findIndex(card => card === cardType)
        player.hand.splice(cardIndex, 1);
        player.stack.push(cardType);
        // if it can't be found, res error
      if (cardIndex === -1) {
        socket.emit('error', {error: `${cardType} does not exist in hand`, location: 'place'});
      }
      let players = game.players;
      players[playerIndex] = player;
      gameUpdates.players = players;

      if(game.phase === 'place first card') {
        // if each player has played 1 card, start new phase
        const allStacks = players.map(player => player.stack.length);
        const allStacksTotal = allStacks.reduce((acc, cv) => acc + cv);
        
        gameUpdates.phase = (allStacksTotal === players.length)? 
          'place or bid' : 'place first card';
      }

      const nextTurn = setNextPlayerTurn(game.playerOrder, game.turn);
      Game
      .findByIdAndUpdate(
        gameId, 
        {$set: {...gameUpdates, turn: nextTurn}},
        {new: true}
      )
      .then(game => {
        if (!game) {
          console.log('no game for some reason');
          socket.emit('error', {error: 'error updating game', location: 'place'});
        }
        let userControlledPlayer = game.players.find(player=> (player.controller === userId));
        let resObj = Object.assign({}, game.serialize(), {userPlayer: userControlledPlayer});
        //if (game.players[game.turn].bot === true) {
          //botTurn;
        //}
        return gameSocket.in(gameId).emit('get update');
      })
      .catch(err => {
        console.log('there was a caught error', err);
      })
    })
  })


  socket.on('bid', function(gameId, bidAmount) {
    const gameUpdates = {};
    console.log('made it here', gameId, bidAmount)
    // make sure the game exists
    Game
    .findById(gameId)
    .then(game=> {
      if(!game) {
        return socket.emit('error', {error: 'not a valid gameId', location: 'bid'});
      }

      //make sure the player exists and it is their turn
      let playerIndex;
      let activePlyr = game.playerOrder[game.turn];
      const player = game.players.find((plyr, index) => {
        if(plyr.controller === userId && index === activePlyr) {
          playerIndex = index;
          return true;
        } else { 
          return false;
        }
      });
      if(!player) {
        return socket.emit('error', {
          error: "user does not exist in players or (more likely) it isn't their turn", 
          location: 'bid'
        });
      }

      //bidAmount must be > current high bid, and <= total number of cards in stacks
      const allStacks = game.players.map(player => player.stack.length);
      const allStacksTotal = allStacks.reduce((acc, cv) => acc + cv);
      if (bidAmount <= game.highBid || bidAmount > allStacksTotal) {
        return socket.emit('error', {
          error: "bid amount must be greater than current high bid, and less than or equal to the number of cards in players' stacks",
          location: "bid"
        });
      }

      // add new info to our game update obj
      player.bid = bidAmount;
      let newPlayers = game.players;
      newPlayers[playerIndex] = player;
      gameUpdates.players = newPlayers;
      gameUpdates.highBid = bidAmount;

      console.log('bidAmount and allStacksTotal', bidAmount, allStacksTotal);
      if (Number(bidAmount) === Number(allStacksTotal)) {
        console.log('BID AMOUNT EQUALS NUMBER OF CARDS ON THE TABLE');
        // change to reveal cards phase, all players pass except user
        gameUpdates.phase = 'reveal cards';
        gameUpdates.players = newPlayers.map((plyr, index) => {
          if (index === playerIndex) {
            return Object.assign(plyr, {passed: false});
          } else {
            return Object.assign(plyr, {passed: true});
          }
        });
        gameUpdates.playerOrder = game.playerOrder.filter(num => num === playerIndex);
      } else {
        gameUpdates.phase = 'bid or pass';
      }  

      //this could probably be made into a util function
      //determine next turn
      //update gamestate in db
      //send gamestate
      const nextTurn = (gameUpdates.phase === 'reveal cards')? 
        0 : setNextPlayerTurn(game.playerOrder, game.turn);

      Game
      .findByIdAndUpdate(
        gameId, 
        {$set: {...gameUpdates, turn: nextTurn}},
        {new: true}
      )
      .then(game => {
        if (!game) {
          return socket.emit('error', {error: 'error updating game', location: 'bid'});
        }
        let userControlledPlayer = game.players.find(player=> (player.controller === userId));
        let resObj = Object.assign({}, game.serialize(), {userPlayer: userControlledPlayer});
        //console.log('emitting game update to room:', gameId);
        //socket.in(gameId).emit('get update')
        gameSocket.in(gameId).emit('get update');
      });
    });
  });



  socket.on('pass', function(gameId) {
    const gameUpdates = {};

    // make sure the game exists
    Game
    .findById(gameId)
    .then(game=> {
      if(!game) {
        return socket.emit('error', {error: 'not a valid gameId', location: 'pass'});
      }

      //make sure the player exists and it is their turn
      let playerIndex;
      let activePlyr = game.playerOrder[game.turn];
      const player = game.players.find((plyr, index) => {
        if(plyr.controller === userId && index === activePlyr) {
          playerIndex = index;
          return true;
        } else { 
          return false;
        }
      });
      if(!player) {
        return socket.emit('error', {
          error: "user does not exist in players or (more likely) it isn't their turn", 
          location: 'pass'
        });
      }

      // make sure phase is 'bid or pass'
      if (game.phase !== 'bid or pass') {
        return socket.emit('error', {
          error: "cannot pass in this phase",
          location: 'pass',
        });
      }

      // add new info to our game update obj
      player.passed = true;
      let newPlayers = game.players;
      newPlayers[playerIndex] = player;
      gameUpdates.players = newPlayers;
      gameUpdates.playerOrder = game.playerOrder.filter(num => num !== playerIndex);

      // if only one player remains after this pass, change phase to 'reveal cards'
      gameUpdates.phase = (gameUpdates.playerOrder.length === 1)? 
        'reveal cards' : 'bid or pass';

      //this could probably be made into a util function
      //determine next turn
      //update gamestate in db
      //send gamestate
      //const nextTurn = (playerIndex === (game.playerOrder.length -1))? 0 : game.turn;
      let nextTurn;
      if(gameUpdates.phase === 'reveal cards') {
        nextTurn = 0;
      } else {
        nextTurn = (playerIndex === (game.playerOrder.length -1))? 0 : game.turn;
      }

      Game
      .findByIdAndUpdate(
        gameId, 
        {$set: {...gameUpdates, turn: nextTurn}},
        {new: true}
      )
      .then(game => {
        if (!game) {
          return socket.emit('error', {error: 'error updating game', location: 'pass'});
        }
        let userControlledPlayer = game.players.find(player=> (player.controller === userId));
        let resObj = Object.assign({}, game.serialize(), {userPlayer: userControlledPlayer});
        
        return gameSocket.in(gameId).emit('get update');
      });
    });
  });



  socket.on('reveal', function(gameId, revealId) {
    const gameUpdates = {};

    // make sure the game exists
    Game
    .findById(gameId)
    .then(game=> {
      if(!game) {
        socket.emit('error', {error: 'not a valid gameId', location: 'reveal'});
      }

      // make sure phase is 'reveal cards'
      if (game.phase !== 'reveal cards') {
        socket.emit('error', {
          error: "cannot reveal cards in this phase",
          location: 'reveal',
        });
      }

      //make sure the player exists and it is their turn
      let playerIndex;
      let activePlyr = game.playerOrder[game.turn];
      const player = game.players.find((plyr, index) => {
        if(plyr.controller === userId && index === activePlyr) {
          playerIndex = index;
          return true;
        } else { 
          return false;
        }
      });
      if(!player) {
        socket.emit('error', {
          error: "user does not exist in players or (more likely) it isn't their turn", 
          location: 'reveal'
        });
      }

      //make sure the selected stack exists and isn't empty;
      let revealPlayerIndex;
      const revealPlayer = game.players.find((plyr, index) => {
        console.log('player find...', plyr.stack);
        if(plyr.controller === revealId && plyr.stack.length > 0 ) {
          console.log('FOUND ONE');
          revealPlayerIndex = index;
          return true;
        } else { 
          return false; 
        }
      });
      console.log('revealPlayer', revealPlayer);
      if(!revealPlayer) {
        socket.emit('error', {
          error: "selected player does not exist in players or does not have cards in their stack", 
          location: 'reveal'
        });
      }

      // must select from your own stack before any other players
      if (player.stack.length > 0 && userId !== revealId) {
        socket.emit('error', {
          error: "must select from your own stack first",
          location: 'reveal',
        });
      }

      // move card from stack to revealed;
      let revealedCard = revealPlayer.stack.pop();
      revealPlayer.revealed.push(revealedCard);
      let players = game.players;
      players[revealPlayerIndex] = revealPlayer;
      gameUpdates.players = players;
      console.log('REVEALED CARD: ', revealedCard);

      if (revealedCard === 'badCard') {
        //  PLAYER LOSES ROUND
        console.log('player loses round');
        // (if player.controller === revealPlayer.controller) user can choose card to discard
        // implement this later
        // until i decide to do that (as a new phase), randomly remove card from player;
        let allPlayerCards = shuffle([...player.stack, ...player.hand, ...player.revealed]);
        let discardIndex = Math.floor( Math.random() * allPlayerCards.length );
        allPlayerCards.splice(discardIndex, 1);
        player.hand = allPlayerCards;
        player.stack = [];
        player.revealed = [];
        gameUpdates.players[playerIndex] = player;

        // if loser is out of cards, they lose and are out of the game
        // if there is only one other player, that player wins the game
        if (player.hand.length === 0 && game.players.length === 2) {
          // update db with game end status and victory declaration
          let winnerName = game.players[revealPlayerIndex].name;
          console.log('WINNER: ', winnerName);
          gameUpdates.phase = `GAME OVER: ${winnerName} Wins!`;

        } else {
          // RESET FOR NEW ROUND
          console.log('reset for new round');
          // set player order for players still in game
          let newPlayerOrder = [];
          let newPlayers = gameUpdates.players.map((plyr, index) => {
            //put cards back in hand
            let hand = [...plyr.hand, ...plyr.stack, ...plyr.revealed];
            //if player still has cards, push them to newPlayerOrder
            if (hand.length) {
              newPlayerOrder.push(index);
            }
            // return playerObj
            const resetPlayer = Object.assign(plyr, {
              hand: shuffle(hand),
              stack: [],
              revealed: [],
              passed: false,
              bid: 0,
            });
            return resetPlayer;
          });
          gameUpdates.playerOrder = newPlayerOrder;
          gameUpdates.players = newPlayers;
          gameUpdates.phase = 'place first card';
          gameUpdates.highBid = 0;
          gameUpdates.round = (gameUpdates.round || game.round) + 1
          // if player out of game, next player becomes start player, else player does
          gameUpdates.startPlayer = (player.hand.length)? playerIndex : setNextPlayerTurn(newPlayerOrder, game.turn);
          gameUpdates.turn = gameUpdates.startPlayer;
        }

      } else {
        // PLAYER REVEALED 'goodCard'
        console.log('player revealed goodCard');
        // if player has revealed the number of cards they bid, they win the round
        const allRevealedCards = gameUpdates.players.map(player => player.revealed.length);
        const countOfAllRevealedCards = allRevealedCards.reduce((acc, cv) => acc + cv);
        if (game.highBid === countOfAllRevealedCards) {
          // PLAYER WINS ROUND
          console.log('player wins round!');
          
          if (player.roundsWon === 1) {
            //PLAYER WINS GAME
          let winnerName = game.players[playerIndex].name;
          console.log('player wins game: ', winnerName);
          gameUpdates.phase = `GAME OVER: ${winnerName} Wins!`;

          } else {
          player.roundsWon = 1;
          gameUpdates.players[playerIndex] = player;

          // RESET FOR NEW ROUND
          // set player order for players still in game
          let newPlayerOrder = [];
          let newPlayers = gameUpdates.players.map((plyr, index) => {
            //put cards back in hand
            let hand = [...plyr.hand, ...plyr.stack, ...plyr.revealed];
            //if player still has cards, push them to newPlayerOrder
            if (hand.length) {
              newPlayerOrder.push(index);
            }
            // return playerObj
            return Object.assign(plyr, {
              hand: shuffle(hand),
              stack: [],
              revealed: [],
              passed: false,
              bid: 0,
            });
          });
          gameUpdates.playerOrder = newPlayerOrder;
          gameUpdates.players = newPlayers;
          gameUpdates.phase = 'place first card';
          gameUpdates.highBid = 0;
          gameUpdates.round = (gameUpdates.round || game.round) + 1
          // if player out of game, next player becomes start player, else player does
          gameUpdates.startPlayer = (player.hand.length)? playerIndex : setNextPlayerTurn(newPlayerOrder, game.turn);
          gameUpdates.turn = gameUpdates.startPlayer;
          }

        } else {
          // PLAYER MUST SELECT AGAIN
          console.log('player must select again');
          // turn stays the same, that's it
          gameUpdates.turn = game.turn;
          // so really nothing happens, this is probably unnecessary until i add turn result messages
        }
      }
      Game
      .findByIdAndUpdate(
        gameId, 
        {$set: {...gameUpdates}},
        {new: true}
      )
      .then(game => {
        if (!game) {
          return socket.emit('error', {error: 'error updating game', location: endpoint})
        }
        gameSocket.in(gameId).emit('get update');
      })
    });
  });

})




/*
 *
 * End IO stuff
 *
 */

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
      server = http.listen(port, () => {
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