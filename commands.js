const request = require('request')
const utils = require('./utils.js')
const db = require('./database.js')
const Entities = require('html-entities').AllHtmlEntities
const entities = new Entities()

var callbacks = null

const setCallbacks = callbacksObj => callbacks = { ...callbacksObj }


// Loads user's chat history from DB, @'s person who called command and says random chat message
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

const leaderboard = (callback, info) => {
    console.log(info.context.username)
    db.loadUsers().then(users => {
        var leaderboard = users[info.target].leaderboard
        var lbMessage = 'Secret word leaderboard '
        for (var i=0; i < 5; i++){
            if (leaderboard[i]){
                lbMessage += ` // ${i+1}. ${leaderboard[i].user} - ${leaderboard[i].score}`
            }
        }
        return callback(lbMessage)
    })
}

const rank = (callback, info) => {
    console.log(info.context.username)
    db.loadUsers().then(users => {
        var leaderboard = users[info.target].leaderboard
        for (var i=0; i < leaderboard.length; i++){
            if (leaderboard[i].user === info.context.username){
                return callback(`@${info.context.username} you are currently ranked #${i+1} with ${leaderboard[i].score} points`)
            }
        }
        return callback(`@${info.context.username} you are not on the secret word leaderboard yet`)
    })
}

const trivia = (callback, info) => {
    request({ url: 'https://opentdb.com/api.php?amount=1&difficulty=easy&type=multiple', json: true }, (err, res) => {
        
        // Trivia question returned with correct answer and 3 incorrect answers
        var results = res.body.results[0]
        
        // Pick random index to mix correct answer with incorrect ones
        var correctIndex = Math.floor(Math.random() * (results.incorrect_answers.length + 1))
        var choices = results.incorrect_answers
        choices.splice(correctIndex, 0, results.correct_answer)
        choices = choices.map(choice => entities.decode(choice))

        // Say the question
        callback('/me ' + entities.decode(res.body.results[0].question) + choices.reduce((acc, cur, i) => acc + `${i + 1}. ${cur} || `, ' ') +
            'You have 30 seconds to answer')
        setTimeout(() => callback('/me 10 seconds left to answer'), 20000)

        // Tell app.js to collect chat for 30 seconds then return it to us
        callbacks.collectUserChat(info.target, 30).then(results => {
            const votes = {}

            // If chat message is a single number, count it as the user's trivia answer (if they don't 
            // already have one)
            for (var result of results) {
                if (result.message.length === 1 && /[1-9]/gi.test(result.message) && !votes[result.username]) {
                    votes[result.username] = result.message
                }
            }
            const winners = Object.keys(votes).filter(voter => votes[voter] === (correctIndex + 1).toString())
            callback(`/me The correct answer was ${choices[correctIndex]}. ${winners.length ?
                winners.join(', ') : 'Nobody'} was correct`)

            // Check DB to see if they have awardPoints enabled and award points if so
            // *** It would be more efficient to get this info from app.js instead of the DB ***
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
    leaderboard,
    rank,
    setCallbacks,
    trivia,
}