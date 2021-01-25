const tmi = require('tmi.js')
const commands = require('./commands.js')
const db = require('./database.js')

require('dotenv').config()

var tmiClient = null

var users = {}

var temporaryChatCollection = {}

const onMessageHandler = (target, context, message, self) => {
    // Return if message is from self or another robot_ape instance
    if (self || context.username === 'robot_ape') { return }
    if (['streamelements', 'nightbot'].includes(context.username)) { return }
    
    // Return if we don't recognize the user whose chat we are in
    if (!target || !users[target.slice(1)]) {
        return console.log(`target ${target} not found in users object`)
    }

    // Check if a secret word was said
    target = target.slice(1)
    const secretWords = users[target].secretWords
    for (var word in secretWords) {
        const wordRegex = new RegExp(word, 'gi')
        if (wordRegex.test(message) && context.username !== secretWords[word].user) {

            // Alert that a secret word was found
            tmiClient.say(target, `${context.username} found a secret word: ${word} . Set on ${secretWords[word].date}
            by ${secretWords[word].user}`)

            // Determine the award
            var diffInMs = new Date() - secretWords[word].date
            const award = 5 * Math.pow(10, Math.floor(diffInMs.toString().length / 2))

            // Say the prize and update leaderboard
            tmiClient.say(target, `They both received ${award} points`)
            var currentLeaderboard = users[target].leaderboard
            for (var winner of [secretWords[word].user, context.username]){
                var foundInLeaderboard = false
                for (var submission of currentLeaderboard){
                    if (submission.user === winner){
                        submission.score += award
                        foundInLeaderboard = true
                        break
                    }
                }
                if (!foundInLeaderboard){
                    currentLeaderboard.push({user: winner, score: award})
                }
            }
            currentLeaderboard = currentLeaderboard.sort((a,b) => a.score > b.score ? -1 : 1)
            db.updateLeaderboard(target, currentLeaderboard)
            
            
            // Clear secret word from memory and update database
            delete secretWords[word]
            db.updateSecretWords(target, secretWords)
        }
    }

    // If user has a trivia active, push chat into temporary collection to look for submitted answers
    if (temporaryChatCollection[target]) {
        temporaryChatCollection[target].push({ username: context.username, message })
    }

    // If robot ape is @'d and atRobotApe is enabled in that chat
    if (/@robot_ape/gi.test(message) && users[target].options.atRobotApe) {
        
        // Reply with a link if word "link" is mentioned 
        if (/link/gi.test(message)){
            tmiClient.say(target, 'Get me in your chat: https://robot-ape.herokuapp.com')
        
        // Otherwise respond with random message from target's chat history
        } else {
            db.loadChat(target).then(chatlog => {
                const randomIndex = Math.floor(Math.random() * chatlog.length)
                tmiClient.say(target, `@${context.username} ${chatlog[randomIndex].message || 'IDK, I\'m a fuckin robot'}`)
            })
        }
    }

    // If message begins with !, parse and call corresponding command
    if (message[0] === '!') {
        const splitMessage = message.split(' ')
        const command = splitMessage[0].slice(1)
        console.log('command: ' + command)
        const extra = splitMessage.slice(1)

        // If someone call for trivia while one is active, inform user and return
        if (command === 'trivia' && temporaryChatCollection[target]) {
            return tmiClient.say(target, `@${context.username} there is already a trivia active.`)
        }

        // Command called directly by name with info and user arguments
        if (command == 'rank' || command == 'leaderboard' || (users[target].options[command] && commands[command])) {
            commands[command](message => tmiClient.say(target, message), { extra, context, target })
        }

    } else {
        // Store chat message if it isn't a command or a bot message
        if (users[target].options.recordChat && !['streamelements, nightbot'].includes(context.username)) {
            var chatRecord = { message, username: context.username, date: new Date() }
            db.addMessage(target, chatRecord)
        }
    }
}

var secretWordRedeemers = {}

const onWhisperHandler = (from, userstate, message, self) => {
    if (self) { return }
    from = from.slice(1)

    // If person who whispered has recently redeemed 'set a secret word'
    if (secretWordRedeemers[from]) {

        // Get first word from message and filter down to alpha characters only
        var secretWord = message.split(' ')[0]
        secretWord = [...secretWord].filter(letter => /[a-z]/gi.test(letter)).join('')

        // Store word in DB, alert in chat, and remove user from secretWordRedemmers
        const swRecipient = secretWordRedeemers[from]
        db.addSecretWord(secretWord, swRecipient, from).then(() => {
            tmiClient.say(swRecipient, `${from} 's secret word has been set`)
            delete secretWordRedeemers[from]
        })
    }
}

// Callback that channelPoints module uses to add secret word redeemers to list of awaiting whispers
const awaitSecretWord = (channel, user) => {
    secretWordRedeemers[user] = channel
}

var opts = {
    identity: {
        username: process.env.BOT_CHANNEL,
        password: process.env.PASS,
    },
    channels: []
}

// When trivia is activated, this function temporarily stores chat into an array
const collectUserChat = async (user, seconds) => {
    temporaryChatCollection[user] = []
    const tempChat = new Promise((resolve, reject) => {
        setTimeout(() => {
            const results = temporaryChatCollection[user]
            delete temporaryChatCollection[user]
            resolve(results)
        }, seconds * 1000)
    })
    return await tempChat
}

// Called at the beginning of execution
const loadUsersAndConnect = async () => {

    // Gets list of users before attempting to connect to tmi
    users = await db.loadUsers()
    opts.channels = Object.keys(users)
    
    // Sets event handlers and connects 
    tmiClient = new tmi.Client(opts)
    tmiClient.on('message', onMessageHandler)
    tmiClient.on('whisper', onWhisperHandler)
    tmiClient.on('connected', () => console.log('chatbot connected'))
    tmiClient.connect().then(() => {
        
        // Start up channelPoints module and commands module and pass down chat related callbacks
        require('./channelPoints.js').setCallbacks({
            awaitSecretWord: awaitSecretWord,
            collectUserChat: collectUserChat,
            say: (target, message) => tmiClient.say(target, message),
        })
        commands.setCallbacks({
            collectUserChat: collectUserChat,
        })
    })
}

loadUsersAndConnect()


// Every 10 seconds we load in our user settings from the database to look for changes
setInterval(() => {
    db.loadUsers().then(userList => {
        var oldUserList = { ...users }
        for (var user in userList) {
            
            // If a new user has been added, start listening to that user's channel 
            if (!users[user]) {
                tmiClient.join(user)
            } else {
                delete oldUserList[user]
            }

            // All user's settings get overwritten with their updated settings (regardless of change)
            users[user] = userList[user]
        }

        // If someone has disconnected their account, leave their channel (tmi) and remove user from memory
        for (var removedUser in oldUserList) {
            tmiClient.part(removedUser)
            delete users[removedUser]
        }
    })
}, 10000)
