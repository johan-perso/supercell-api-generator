#!/usr/bin/env node

// Imports libs
var chalk = require("chalk")
var Mailjs
var fs
var path
var inquirer
var ora
var spinner

// Function to show help page
function showHelp(){
	return console.log(`
 Usage
   $ supercell-gen

 Options
   --version -v     Show installed version
   --help    -h     Show infos on usage

 FAQ:
   Q: Why use this CLI?
   A: This CLI can allow you to easily create Supercell Develooper accounts for each supported game. To manage them, you will have to login through the official dashboard.

   Q: What are the supported games?
   A: Currently, the supported games are: Brawl Stars, Clash of Clans, Clash Royale.

   Q: "Error while creating account: Temporary application error, request failed."
   A: This error can happen when creating too many accounts or being too suspicious. It also happens when creating accounts from the official site so I can't do anything about it, just try again later.

   Q: Process keeps running but nothing happens
   A: The process will not stop itself because it will still wait for mails to arrive, you can stop it manually with CTRL+C or by closing the terminal.
`)
}

// Function to show version
function showVersion(){
	console.log(`Supercell API Generator is using version ${chalk.cyan(require("./package.json").version)}`)
	console.log("────────────────────────────────────────────")
	console.log("Developed by Johan")
	console.log(chalk.cyan("https://johanstick.fr"))
	process.exit()
}

// Check if some arguments are present
var defaultArgs = process.argv.slice(2)
if(defaultArgs.includes("version") || defaultArgs.includes("v") || defaultArgs.includes("--version") || defaultArgs.includes("-v")) return showVersion()
if(defaultArgs.includes("help") || defaultArgs.includes("h") || defaultArgs.includes("--help") || defaultArgs.includes("-h")) return showHelp()

// Ask user important infos
async function askInfos(){
	// Log
	console.log("We will ask you some questions that are required to create accounts.")
	console.log("To improve the user experience, a temporary mail will be used for all registers.\n")

	// Ask games list
	var { GAMES_LIST } = await inquirer.prompt([{
		type: "checkbox",
		name: "GAMES_LIST",
		message: "Games to create accounts for",
		choices: ["Brawl Stars", "Clash of Clans", "Clash Royale"],
		validate: function(answer){
			if(answer.length < 1) return "You must choose at least one game"
			return true
		}
	}])

	// Ask whitelisted IPs
	console.log(`\n${chalk.yellow("| Explanation on whitelisted IPs:")}\nSupercell APIs only allows whitelisted IPs to access their data through your account.\nAdd the address of your host server for example, or your current one for testing.\nYou will be able to add or remove IPs later by logging into your account.`)
	var { WHITELISTED_IPS } = await inquirer.prompt([{
		type: "input",
		name: "WHITELISTED_IPS",
		message: "Enter IPs to whitelist (comma separated)",
		validate: function(answer){
			if(answer.length < 1) return "You must provide at least one IP"
			var ips = answer.split(",").map(ip => ip.trim())
			for(var i = 0; i < ips.length; i++){
				if(!ips[i].match(/^(\d{1,3}\.){3}\d{1,3}$/)) return "One or more IPs are not valid. Please provide valids IPv4 addresses"
			}
			return true
		}
	}])

	return { GAMES_LIST, WHITELISTED_IPS }
}

// Function to fetch
var _fetch = global.fetch
async function fetch(url, options){
	if(!options) options = {}
	if(!options.headers) options.headers = {}
	options.headers["Content-Type"] = "application/json"
	options.headers["User-Agent"] = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36"

	if(options.body && typeof options.body === "object") options.body = JSON.stringify(options.body)

	var data = await _fetch(url, options)
	var json
	try {
		json = await data.json()
	} catch(e) {
		json = { status: { message: await data.text() } }
	}

	return { json, cookies: data.headers.get("set-cookie") }
}

// List of games domains
var gamesDomains = {
	"Brawl Stars": "https://developer.brawlstars.com",
	"Clash of Clans": "https://developer.clashofclans.com",
	"Clash Royale": "https://developer.clashroyale.com"
}

// Main function
async function main(){
	// Import libs
	if(!fs) fs = require("fs")
	if(!path) path = require("path")
	if(!ora) ora = require("ora")
	if(!spinner) spinner = ora()
	if(!inquirer) inquirer = require("inquirer")
	if(!Mailjs) Mailjs = require("@cemalgnlts/mailjs")

	// Ask user infos
	var { GAMES_LIST, WHITELISTED_IPS } = await askInfos()
	console.log() // line break

	// Generate a random user name
	spinner.start("Generating fake name")
	var randomName = Math.random().toString(36).substring(2, 10)
	randomName = randomName.charAt(0).toUpperCase() + randomName.slice(1)
	spinner.succeed(`Fake name: ${randomName}`)

	// Generate a random password : 16 random characters, some chars are uppercase
	spinner.start("Generating random password")
	var randomPassword = Math.random().toString(36).substring(2, 10) + Math.random().toString(36).substring(2, 10)
	randomPassword = randomPassword.split("").map(char => Math.random() < 0.7 ? char : char.toUpperCase()).join("")
	randomPassword = randomPassword + ["!", "?", "!!", "?!"][Math.floor(Math.random() * 4)]
	spinner.succeed(`Random password: ${randomPassword}`)

	// Generate a random email
	spinner.start("Creating temporary mail")
	const mailjs = new Mailjs()
	var mailAccount
	try {
		mailAccount = await mailjs.createOneAccount()
	} catch(e) {
		if(spinner) spinner.stop()
		console.error("Unable to create a temp mail (maybe just try again):", e)
		process.exit(1)
	}
	if(!mailAccount.status) throw new Error(`Error while creating mail account: ${mailAccount.message}`)

	// Change spinner with mail infos
	spinner.succeed(`Temporary mail: ${mailAccount.data.username}:${mailAccount.data.password}`)
	console.log(chalk.dim(" (you can login to this mail on https://mail.tm)"))

	// In parallel, wait for mail arrival
	mailjs.on("arrive", async msg => {
		// Check mail title
		console.log(`[DEBUG] Received mail: ${msg.subject} (from ${msg.from.address})`)
		if(!msg.subject.includes("Welcome to the ")) return

		// Get mail content
		var content = await mailjs.getMessage(msg.id)
		content = content?.data
		if(!content) return

		// Get activation token (https://developer.*.com/#/verify/TOKEN")
		var activationToken
		var game
		try {
			var activationLink = content.text?.match(/https:\/\/developer\.[^"]+/g)?.[0]
			activationLink = activationLink?.split("\n")?.[0]
			activationToken = activationLink?.split("verify/")?.[1]?.split("\"")?.[0]
			game = activationLink?.split("https://developer.")?.[1]?.split(".com")?.[0]
			game = game == "brawlstars" ? "Brawl Stars" : game == "clashofclans" ? "Clash of Clans" : game == "clashroyale" ? "Clash Royale" : "Unknown game"
		} catch(e) {
			console.warn("[DEBUG] No activation token found in mail")
		}
		if(!activationToken || !game) return console.warn("[DEBUG] No activation token or game found in mail") // Supercell also send an email when the account is successfully created

		// Activate account
		console.log(`${chalk.blue.bold("[REGISTER]")} ${chalk.blue(`(${game})`)} Activating account`)
		var response = await fetch(`${gamesDomains[game]}/api/verify`, {
			method: "POST",
			body: { token: activationToken, password: randomPassword, tcAccepted: true }
		})
		response = response.json
		if(response.error || response.description || response?.status?.message != "ok") return console.error(`${chalk.blue.bold("[REGISTER]")} ${chalk.blue(`(${game})`)} Error while activating account: ${response.description || response.error || response?.status?.message || response?.status || response}`)

		// Log in
		console.log(`${chalk.blue.bold("[REGISTER]")} ${chalk.blue(`(${game})`)} Logging in...`)
		var loginResponse = await fetch(`${gamesDomains[game]}/api/login`, {
			method: "POST",
			body: { email: mailAccount.data.username, password: randomPassword }
		})
		var loginCookie = loginResponse.cookies
		loginResponse = loginResponse.json
		if(loginResponse.error || loginResponse.description || loginResponse?.status?.message != "ok") return console.error(`${chalk.blue.bold("[REGISTER]")} ${chalk.blue(`(${game})`)} Error while logging in: ${loginResponse.description || loginResponse.error || loginResponse?.status?.message || loginResponse?.status || loginResponse}`)

		// Create a new API key
		console.log(`${chalk.blue.bold("[REGISTER]")} ${chalk.blue(`(${game})`)} Creating API key...`)
		var apiKeyResponse = await fetch(`${gamesDomains[game]}/api/apikey/create`, {
			method: "POST",
			body: { name: "generated", description: "no description provided", scopes: null, cidrRanges: WHITELISTED_IPS.split(",").map(ip => ip.trim()) },
			headers: { "Cookie": loginCookie }
		})
		apiKeyResponse = apiKeyResponse.json
		if(apiKeyResponse.error || apiKeyResponse.description || apiKeyResponse?.status?.message != "ok") return console.error(`${chalk.blue.bold("[REGISTER]")} ${chalk.blue(`(${game})`)} Error while creating API key: ${apiKeyResponse.description || apiKeyResponse.error || apiKeyResponse?.status?.message || apiKeyResponse?.status || apiKeyResponse}`)

		// Log the API key
		console.log(chalk.yellow(`${chalk.blue.bold("[REGISTER]")} ${chalk.blue(`(${game})`)} API key created!`))
		console.log(chalk.yellow(apiKeyResponse?.key?.key || apiKeyResponse?.key || apiKeyResponse))
	})

	// Pass on every game
	for(var game of GAMES_LIST){
		var gameDomain = gamesDomains[game]

		console.log(`${chalk.blue.bold("[REGISTER]")} ${chalk.blue(`(${game})`)} Creating account...`)
		var response = await fetch(`${gameDomain}/api/register`, {
			method: "POST",
			body: {
				name: randomName,
				email: mailAccount.data.username,
				captchaVerified: true
			}
		})
		response = response.json
		if(response.error || response.description || response?.status?.message != "ok") console.error(`${chalk.blue.bold("[REGISTER]")} ${chalk.blue(`(${game})`)} Error while creating account: ${response.description || response.error || response?.status?.message || response?.status || response}`)

		await new Promise(resolve => setTimeout(resolve, 2000))
	}
}
main()
