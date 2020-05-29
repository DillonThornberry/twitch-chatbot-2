const utils = require('./utils.js')

var chatHistory = require('./chat-history.json')

const history = (callback, info) => {
    var chosenUser = utils.removeAtSign(info.extra).toLowerCase()
    console.log(chosenUser)
    if (!chosenUser) {
        var randomHistory = utils.getRandomHistory()
        callback(`" ${randomHistory.message} " - ${randomHistory.user}`)
    } else if (!chatHistory.some(message => message.user === chosenUser)) {
        callback('No history to show for ' + chosenUser)
    } else {
        callback(utils.getRandomHistory(chosenUser).message)
    }
}

const slots = (callback, info) => {

}

const trivia = (callback, info) => {

}

module.exports = {
    history,
    slots,
    trivia,
}