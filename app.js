const tmi = require('tmi.js')
const { MongoClient } = require('mongodb')
const commands = require('./commands.js')

require('dotenv').config()

const dbClient = new MongoClient(process.env.DB_URL)
var tmiClient = null
var db = null

var users = {}

var temporaryChatCollection = {}

const onMessageHandler = (target, context, message, self) => {
    if (self) { return }
    target = target.slice(1)

    const secretWords = users[target].secretWords
    for (var word in secretWords) {
        const wordRegex = new RegExp(word, 'gi')
        if (wordRegex.test(message) && context.username !== secretWords[word].user) {
            tmiClient.say(target, `${context.username} found a secret word: ${word} . Set on ${secretWords[word].date}
            by ${secretWords[word].user}`)
            diffInMs = new Date() - secretWords[word].date
            const award = 5 * Math.pow(10, Math.floor(diffInMs.toString().length / 2))
            if (users[target].options.awardPoints) {
                tmiClient.say(target, `!add ${context.username} ${award}`)
            }
            delete secretWords[word]
            db.collection('users').updateOne(
                { 'twitchDetails.login': target },
                { $set: { secretWords: secretWords } }
            ).then(result => console.log(result))

        }
    }

    if (temporaryChatCollection[target]) {
        temporaryChatCollection[target].push({ username: context.username, message })
    }

    if (/@robot_ape/gi.test(message) && users[target].options.atRobotApe) {
        loadChat(target).then(chatlog => {
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
            db.collection('chat').updateOne(
                { twitchName: target },
                { $push: { chatlog: chatRecord } }
            )
        }
    }
}

var secretWordRedeemers = {}

const onWhisperHandler = (from, userstate, message, self) => {
    if (self) { return }
    from = from.slice(1)
    if (secretWordRedeemers[from]) {
        const secretWord = message.split(' ')[0]
        const swRecipient = secretWordRedeemers[from]
        const wordLocation = `secretWords.${secretWord}`
        db.collection('users').updateOne(
            { 'twitchDetails.login': swRecipient },
            { $set: { [wordLocation]: { user: from, date: new Date() } } }
        ).then(() => tmiClient.say(swRecipient, `${from} 's secret word has been set`))
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

const loadChat = async (user) => {
    const chatHistory = await db.collection('chat').findOne({ twitchName: user })
    return chatHistory.chatlog
}

const loadUsers = async () => {
    const userColl = db.collection('users')
    var users = {}
    await userColl.find({}).forEach(user => {
        users[user.twitchDetails.login] = {
            options: user.options, refreshToken: user.refreshToken,
            twitchID: user.twitchID, secretWords: user.secretWords
        }
    })
    return users
}

const loadUsersAndConnect = async () => {
    await dbClient.connect()
    db = dbClient.db('chatbot-db')
    console.log('bot connect to DB')
    users = await loadUsers()
    opts.channels = Object.keys(users)

    tmiClient = new tmi.Client(opts)
    tmiClient.on('message', onMessageHandler)
    tmiClient.on('whisper', onWhisperHandler)
    tmiClient.on('connected', () => console.log('chatbot connected'))
    tmiClient.connect().then(() =>
        require('./channelPoints.js')
    )

}

const say = (target, message) => tmiClient.say(target, message)

loadUsersAndConnect()

setInterval(() => {
    loadUsers().then(userList => {
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

module.exports = { awaitSecretWord, collectUserChat, loadChat, loadUsers, say, }
