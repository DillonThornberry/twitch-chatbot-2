const tmi = require('tmi.js')
const { MongoClient } = require('mongodb')

require('dotenv').config()

const dbClient = new MongoClient(process.env.DB_URL)
var tmiClient = null

var users = {}

const onMessageHandler = (target, context, message, self) => {
    if (self) { return }
    target = target.slice(1)

    if (/@robot_ape/gi.test(message) && users[target].options.atRobotApe) {
        tmiClient.say(target, 'hello')
    }

    if (message[0] === '!') {
        const split = message.split()
        const command = split[0].slice(1)
        const extra = split.slice(1)

        if (users[target].options[command]) {
            console.log('command')
            tmiClient.say(target, 'command')
        }
    }
}

const loadUsers = async () => {
    const userColl = dbClient.db('chatbot-db').collection('users')
    var users = {}
    await userColl.find({}).forEach(user => {
        users[user.twitchDetails.login] = { options: user.options }
    })
    return users
}

var opts = {
    identity: {
        username: process.env.BOT_CHANNEL,
        password: process.env.PASS,
    },
    channels: []
}

const loadUsersAndConnect = async () => {
    await dbClient.connect()
    console.log('bot connect to DB')
    users = await loadUsers()
    opts.channels = Object.keys(users)

    tmiClient = new tmi.Client(opts)
    tmiClient.on('message', onMessageHandler)
    tmiClient.on('connected', () => console.log('chatbot connected'))
    tmiClient.connect()
}

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
        console.log(users)
    })
}, 10000)

