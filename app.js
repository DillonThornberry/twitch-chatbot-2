const tmi = require('tmi.js')
const commands = require('./commands.js')
const db = require('./database.js')

require('dotenv').config()

var tmiClient = null

var users = {}

var temporaryChatCollection = {}

const onMessageHandler = (target, context, message, self) => {
    if (self || context.username === 'robot_ape') { return }
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

            // If they have award points enabled, say the prize and update leaderboard
            if (users[target].options.awardPoints) {
                tmiClient.say(target, `They both received ${award} points`)

            }
            
            // Clear separate word from memory and update database
            delete secretWords[word]
            db.updateSecretWords(target, secretWords)
        }
    }

    if (temporaryChatCollection[target]) {
        temporaryChatCollection[target].push({ username: context.username, message })
    }

    if (/@robot_ape/gi.test(message) && users[target].options.atRobotApe) {
        db.loadChat(target).then(chatlog => {
            const randomIndex = Math.floor(Math.random() * chatlog.length)
            tmiClient.say(target, `@${context.username} ${chatlog[randomIndex].message}`)
        })
    }

    if (message[0] === '!') {
        const splitMessage = message.split(' ')
        const command = splitMessage[0].slice(1)
        const extra = splitMessage.slice(1)

        if (command === 'trivia' && temporaryChatCollection[target]) {
            return tmiClient.say(target, `@${context.username} there is already a trivia active.`)
        }

        if (users[target].options[command] && commands[command]) {
            commands[command](message => tmiClient.say(target, message), { extra, context, target })
        }

    } else {
        if (users[target].options.recordChat) {
            var chatRecord = { message, username: context.username, date: new Date() }
            db.addMessage(target, chatRecord)
        }
    }
}

var secretWordRedeemers = {}

const onWhisperHandler = (from, userstate, message, self) => {
    if (self) { return }
    from = from.slice(1)
    if (secretWordRedeemers[from]) {
        var secretWord = message.split(' ')[0]
        secretWord = [...secretWord].filter(letter => /[a-z]/gi.test(letter)).join('')
        const swRecipient = secretWordRedeemers[from]
        db.addSecretWord(secretWord, swRecipient, from).then(() => {
            tmiClient.say(swRecipient, `${from} 's secret word has been set`)
            delete secretWordRedeemers[from]
        })
    }
}

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

const loadUsersAndConnect = async () => {
    users = await db.loadUsers()
    opts.channels = Object.keys(users)

    tmiClient = new tmi.Client(opts)
    tmiClient.on('message', onMessageHandler)
    tmiClient.on('whisper', onWhisperHandler)
    tmiClient.on('connected', () => console.log('chatbot connected'))
    tmiClient.connect().then(() => {
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

setInterval(() => {
    db.loadUsers().then(userList => {
        var oldUserList = { ...users }
        for (var user in userList) {
            if (!users[user]) {
                tmiClient.join(user)
            } else {
                delete oldUserList[user]
            }
            users[user] = userList[user]
        }
        for (var removedUser in oldUserList) {
            tmiClient.part(removedUser)
            delete users[removedUser]
        }
    })
}, 10000)
