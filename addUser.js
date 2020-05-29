const fs = require('fs')
const readLineSync = require('readline-sync')

const users = require('./users.json')

var userToAdd = readLineSync.question('Enter twitch username: ').toLowerCase()

const trueOrFalse = question => readLineSync.question(question + ' (Y/N): ').toLowerCase() === 'y' ? true : false

while (/[^\d\w_]/.test(userToAdd)) {
    console.log('Username can only contain numbers, letters, underscore')
    userToAdd = readLineSync.question('Enter twitch username: ').toLowerCase()
}

users[userToAdd] = { commands: {} }
var myCommands = users[userToAdd].commands

myCommands.history = trueOrFalse('History?')
myCommands.atRobotApe = trueOrFalse('Want robot ape to respond when @\'ed?')
myCommands.trivia = trueOrFalse('Trivia?')
myCommands.slots = trueOrFalse('Slots?')
myCommands.awardPoints = trueOrFalse('Award points for slots and trivia?')

fs.writeFile('users.json', JSON.stringify(users), () => console.log('user settings updated'))


