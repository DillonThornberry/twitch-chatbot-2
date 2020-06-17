const { MongoClient } = require('mongodb')

require('dotenv').config()

const dbUrl = `mongodb+srv://thornberry:${process.env.DB_PASS}@cluster0-juoio.mongodb.net/Cluster0?retryWrites=true&w=majority`

const client = new MongoClient(dbUrl)

const connectToDB = async () => {
    await client.connect()
    console.log('connected')
    const db = client.db('Cluster0')
    const testCol = db.collection('test-collection')
    const testData = { a: 1, b: 'hello', c: true }
    await testCol.insertOne(testData)
    const cursor = await testCol.find({})
    console.log(await cursor.toArray())
    // await testCol.deleteMany({})
    // console.log(await testCol.find({}).toArray())
}

connectToDB()

