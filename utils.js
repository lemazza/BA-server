const {Game} = require('./models');


function createHumanPlayer(userId, username, gameCreator) {
  return {
    creator: gameCreator,
    controller: userId,
    name: username,
    hand: ['goodCard', 'goodCard', 'goodCard', 'badCard'],
    stack: [],
    roundsWon: 0,
    bid: 0,
    active: false,
    passed: false,
    loggedIn: true,
  }
}


function shuffle(array) {
  var currentIndex = array.length, temporaryValue, randomIndex;

  // While there remain elements to shuffle...
  while (0 !== currentIndex) {

    // Pick a remaining element...
    randomIndex = Math.floor(Math.random() * currentIndex);
    currentIndex -= 1;

    // And swap it with the current element.
    temporaryValue = array[currentIndex];
    array[currentIndex] = array[randomIndex];
    array[randomIndex] = temporaryValue;
  }

  return array;
}


function setStartGameOrder (game) {
  // shuffle player order (basically how you sit around the table)
  let players = shuffle(game.players);

  // build array 0 through number of players
  let playerOrder = [];
  for (let i = 0; i < players.length; i++) {
    playerOrder.push(i);
  }

  //choose random first player
  const startPlayer = Math.floor(Math.random() * playerOrder.length);

  return {players, playerOrder, startPlayer, turn: startPlayer} 
}


function setNextPlayerTurn (playerOrder, currentTurn) {
  if (currentTurn >= (playerOrder.length - 1)) return 0;
  else return currentTurn + 1;
}


function updateGameAndSendRes (res, gameId, userId, gameUpdates, endpoint) {
  console.log('made it here in updateGameAndSendRes');
  Game
  .findByIdAndUpdate(
    gameId, 
    {$set: {...gameUpdates}},
    {new: true}
  )
  .then(game => {
    if (!game) {
      return {
        resObj: {error: 'error updating game', location: endpoint},
        resStatus: 400,
      }
    }
    let userControlledPlayer = game.players.find(player=> (player.controller === userId));
    let resObj = Object.assign({}, game.serialize(), {userPlayer: userControlledPlayer});
    
    return res.status(200).json(resObj);
  })
  .catch(err => {
    console.log('error is ', err);
    return {
      resObj: {
      errorText: 'something went wrong updating game',
      error: err,
      location: 'updateGameAndSendRes',
      },
      resStatus: 400
    }
  });
}




module.exports = {createHumanPlayer, updateGameAndSendRes, setStartGameOrder, setNextPlayerTurn, shuffle};
