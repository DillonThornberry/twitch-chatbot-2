const request = require('request')
const utils = require('./utils.js')
const db = require('./database.js')
const Entities = require('html-entities').AllHtmlEntities
const entities = new Entities()

var callbacks = null

const setCallbacks = callbacksObj => callbacks = { ...callbacksObj }

const history = (callback, info) => {
    db.loadChat(info.target).then(chatlog => {
        targetChatter = info.extra[0] ? utils.removeAtSign(info.extra[0]).toLowerCase() : info.context.username
        const targetChats = chatlog.filter(chat => chat.username === targetChatter)
        if (targetChats.length) {
            callback(targetChats[Math.floor(Math.random() * targetChats.length)].message)
        } else {
            callback(`No chat history for ${targetChatter}`)
        }
    })
}

const slotsEmotes = ['hypnot21ZONE', 'hypnot21LUV', 'hypnot21TakeTheL', 'ftsnnaCRACKED', 'hypnot21GG', 'hypnot21HYPE']

const slots = (callback, info) => {
    var slotsResults = []
    for (var i = 0; i < 3; i++) {
        slotsResults.push(slotsEmotes[Math.floor(Math.random() * slotsEmotes.length)])
    }
    if (slotsResults.every(result => result === slotsResults[0])) {
        callback(`${info.context.username}, You got ${slotsResults[0]} / ${slotsResults[1]} / ${slotsResults[2]} and won!`)
        db.loadUsers().then(users => {
            if (users[info.target].options.awardPoints) {
                utils.awardPoints([info.context.username], 5000, callback)
            }
        })
    } else {
        callback(`${info.context.username}, You got ${slotsResults[0]} / ${slotsResults[1]} / ${slotsResults[2]} loser!`)
    }
}

const trivia = (callback, info) => {
    request({ url: 'https://opentdb.com/api.php?amount=1&difficulty=easy&type=multiple', json: true }, (err, res) => {
        var results = res.body.results[0]
        var correctIndex = Math.floor(Math.random() * (results.incorrect_answers.length + 1))
        var choices = results.incorrect_answers
        choices.splice(correctIndex, 0, results.correct_answer)
        choices = choices.map(choice => entities.decode(choice))
        // Say the question
        callback('/me ' + entities.decode(res.body.results[0].question) + choices.reduce((acc, cur, i) => acc + `${i + 1}. ${cur} || `, ' ') +
            'You have 30 seconds to answer')
        setTimeout(() => callback('/me 10 seconds left to answer'), 20000)
        callbacks.collectUserChat(info.target, 30).then(results => {
            const votes = {}
            for (var result of results) {
                if (result.message.length === 1 && /[1-9]/gi.test(result.message) && !votes[result.username]) {
                    votes[result.username] = result.message
                }
            }
            const winners = Object.keys(votes).filter(voter => votes[voter] === (correctIndex + 1).toString())
            callback(`/me The correct answer was ${choices[correctIndex]}. ${winners.length ?
                winners.join(', ') : 'Nobody'} was correct`)
            db.loadUsers().then(users => {
                if (users[info.target].options.awardPoints) {
                    utils.awardPoints(winners, 5000, callback)
                }
            })
        })
    })
}

module.exports = {
    history,
    setCallbacks,
    slots,
    trivia,
}