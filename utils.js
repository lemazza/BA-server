//utils

function createHumanPlayer(userId, username, gameCreator) {
  return {
    creator: gameCreator,
    controller: userId,
    name: username,
    hand: ['goodCard', 'goodCard', 'goodCard', 'badCard'],
    stack: [],
    roundsWon: 0,
    bid: 0,
    tablePosition: -1,
    active: false,
    passed: false,
    loggedIn: true,
  }
}


module.exports = {createHumanPlayer};
