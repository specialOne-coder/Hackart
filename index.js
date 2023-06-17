const express = require('express');
const axios = require('axios');
const dotenv = require('dotenv');
const cors = require('cors');
const { MichelsonMap } = require("@taquito/michelson-encoder");
const { InMemorySigner } = require("@taquito/signer")
const { MichelCodecPacker, TezosToolkit } = require("@taquito/taquito")
const { Bytes, Chain_id, Key, Nat, Option, Or, pair_to_mich, Signature, string_to_mich } = require('@completium/archetype-ts-types')

const corsOptions = {
    origin: process.env.CLIENT_URL,
    credentials: true,            //access-control-allow-credentials:true
    optionSuccessStatus: 200,
}

const app = express().use(express.json()).use(cors());

dotenv.config()

const port = process.env.PORT ?? 3000;
const apiKey = process.env.API_KEY;

if ((apiKey === undefined) || (apiKey === null)) {
    throw ('API_KEY env var must be set');
}

app.get('/feelings', async (req, res) => {
    const data = await fetchData();
    res.send(JSON.stringify(data));
});

app.get('/day/:day', async (req, res) => {
    const data = await fetchDataSpecificDay(parseInt(req.params['day'], 10));
    res.send(JSON.stringify(data));
});

app.post('/mint', async (req, res) => {
    const params = req.body;
    console.log("Params =>", params);
    try {
        const data = await mintNFT(params);
        // res.send({ status: 200, response: data });

    } catch (error) {
        console.log("Error mint=>", error);
    }
});

app.post('/changeMetadata', async (req, res) => {
    const params = req.body;
    const data = await changeNftMetadata(params);
    res.send({ status: 200, response: data });
});

app.get('/userNft/:address', async (req, res) => {
    const data = await getUserNFTs(req.params['address']);
    res.send(JSON.stringify(data));
});

app.get('/userAllNts/:address', async (req, res) => {
    const data = await getUserAllNFTs(req.params['address']);
    res.send(JSON.stringify(data));
});

const initToolkit = (rpcEndpoint, secretKey) => {
    const toolkit = new TezosToolkit(rpcEndpoint)
    toolkit.setProvider({
        signer: new InMemorySigner(secretKey),
    })
    toolkit.setPackerProvider(new MichelCodecPacker())
    return toolkit
}

let toolkit = initToolkit(process.env.GHOSTNET_RPC_PROVIDER, process.env.ADMIN_SECRET_KEY);
app.listen(port, () => {
    console.log(`Example app listening on port ${port}`);
});


async function fetchData() {
    const data = {};

    try {
        const readinessRes = await axios.get(`https://api.ouraring.com/v1/readiness?access_token=${apiKey}`);
        const readiness = readinessRes.data['readiness'].reduce((prev, current) => {
            return (prev['summary_date'] > current['summary_date']) ? prev : current;
        });

        data['readinessScore'] = readiness['score'];
        // data['scoreTemperature'] = readiness['score_temperature'];
    } catch (e) {
        console.error("failed to get readiness data from ouraring", e);
    }

    try {
        const sleepRes = await axios.get(`https://api.ouraring.com/v1/sleep?access_token=${apiKey}`);
        const sleep = sleepRes.data['sleep'].reduce((prev, current) => {
            return (prev['summary_date'] > current['summary_date']) ? prev : current;
        });

        data['sleepScore'] = sleep['score'];
        data['temperatureDelta'] = Math.round(sleep['temperature_delta'] * 100);
    } catch (e) {
        console.error("failed to get sleep data from ouraring", e);
    }

    return data;
}

async function fetchDataSpecificDay(day) {
    const data = {};

    try {
        const readinessRes = await axios.get(`https://api.ouraring.com/v1/readiness?access_token=${apiKey}`);
        const readiness = readinessRes.data['readiness'][6 - day];

        data['readinessScore'] = readiness['score'];
        // data['scoreTemperature'] = readiness['score_temperature'];
    } catch (e) {
        console.error("failed to get readiness data from ouraring", e);
    }

    try {
        const sleepRes = await axios.get(`https://api.ouraring.com/v1/sleep?access_token=${apiKey}`);
        const sleep = sleepRes.data['sleep'][6 - day];

        data['sleepScore'] = sleep['score'];
        data['temperatureDelta'] = Math.round(sleep['temperature_delta'] * 100);
    } catch (e) {
        console.error("failed to get sleep data from ouraring", e);
    }

    return data;
}

async function mintNFT(params) {
    const contract = await toolkit.contract.at(process.env.NFT_CONTRACT_ADDRESS)
    let metadata = await buildMetadata(params.attributes);
    console.log('Build metadata => ', metadata);
    const tx = contract.methods["mint"](params.userAddress, metadata)
    console.log('tx =>', tx);
    try {
        const op = await tx.send()
        if (op.results) {
            return op;
        }
    } catch (e) {
        console.log("Mint error =>", e);
    }
}

async function buildMetadata(attributes) {
    // let metadata = [
    //     "name", Buffer.from('Forget Me').toString('hex'),
    //     // ["description", new Bytes(Buffer.from('Tezos ubisoft nft').toString('hex'))._content],
    //     // ["decimals", new Bytes(Buffer.from('0').toString('hex'))._content],
    //     // ["attributes",  new Bytes(Buffer.from(`${attributes}`).toString('hex'))._content]
    // ]

    let metadata = MichelsonMap.fromLiteral({
        name: Buffer("tezos-stora", "ascii").toString("hex"),
        description: Buffer("tezos-stora", "ascii").toString("hex"),
    });
    return metadata;
}

async function changeNftMetadata(params) {
    const contract = await toolkit.contract.at(process.env.NFT_CONTRACT_ADDRESS)
    const tx = contract.methods["set_token_metadata"](params.tid, params.tdata)
    try {
        const op = await tx.send()
        if (op.results) {
            return op;
        }
    } catch (e) {
        console.log("Mint error =>", e);
    }
}

async function getUserNFTs(address) {
    let finalResponse = [];
    await axios({
        method: 'get',
        headers: {
            'Access-Control-Allow-Origin': '*',
            'Content-Type': 'application/json',
        },
        params: {
            'address': address
        },
        url: `${process.env.TZKT_API_URL}tokens/balances?account=${address}&token.contract=${process.env.NFT_CONTRACT_ADDRESS}`,
    })
        .then((response) => {
            console.log("Get nft respons => ", response);
        }).catch(function (error) {
            console.log("Connect error : ", error);
        });
    return finalResponse;
}

function filterForHaveNft(allTokens) {
    let nfts = [];
    for (let index in allTokens) {
        let token = allTokens[index].token
        console.log('Token =>', token);
        if (token.metadata) {
            if (parseInt(allTokens[index].balance) > 0 && token.metadata.decimals == 0) {
                nfts.push(token);
            }
        }
    }
    return nfts;
}

async function getUserAllNFTs(address) {
    let finalResponse = [];
    await axios({
        method: 'get',
        headers: {
            'Access-Control-Allow-Origin': '*',
            'Content-Type': 'application/json',
        },
        params: {
            'address': address
        },
        url: `${process.env.TZKT_API_URL}tokens/balances?account=${address}`,
    })
        .then((response) => {
            // console.log("Get nft respons => ", response.data);
            let userNfts = filterForHaveNft(response.data);
            console.log('Final nfts =>', userNfts);
        }).catch(function (error) {
            console.log("Connect error : ", error);
        });
    return finalResponse;
}

