const chatHistory = require('./chat-history.json')

const getRandomHistory = user => {
    var currentHistory = [...chatHistory]
    if (user) {
        var currentHistory = chatHistory.filter(message => message.user === user)
    }

    return currentHistory[Math.floor(Math.random() * currentHistory.length)]
}

const removeAtSign = username => username[0] === '@' || username[0] === '#' ? username.slice(1) : username

module.exports = {
    getRandomHistory,
    removeAtSign,
}