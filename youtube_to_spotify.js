var fs = require("fs");
var readline = require("readline");
var { google } = require("googleapis");
var OAuth2 = google.auth.OAuth2;
var cs = require("./client_secret.json");
var youtubedl = require("youtube-dl");
var fetch = require("node-fetch");
var url = "http://localhost:4000/graphql";

/**START from google api quick start - used for authorization**/
// If modifying these scopes, delete your previously saved credentials
// at ~/.credentials/youtube-nodejs-quickstart.json
var SCOPES = ["https://www.googleapis.com/auth/youtube.readonly"];
var TOKEN_DIR =
  (process.env.HOME || process.env.HOMEPATH || process.env.USERPROFILE) +
  "/.credentials/";
var TOKEN_PATH = TOKEN_DIR + "youtube-nodejs-quickstart.json";

// Load client secrets from a local file.
fs.readFile("client_secret.json", function processClientSecrets(err, content) {
  if (err) {
    console.log("Error loading client secret file: " + err);
    return;
  }
  // Authorize a client with the loaded credentials, then call the YouTube API.
  authorize(JSON.parse(content), addSongToSpotifyPlaylist);
});

/**
 * Create an OAuth2 client with the given credentials, and then execute the
 * given callback function.
 *
 * @param {Object} credentials The authorization client credentials.
 * @param {function} callback The callback to call with the authorized client.
 */
function authorize(credentials, callback) {
  var clientSecret = cs.web.client_secret;
  var clientId = cs.web.client_id;
  var redirectUrl = cs.web.redirect_uris[0];
  var oauth2Client = new OAuth2(clientId, clientSecret, redirectUrl);

  // Check if we have previously stored a token.
  fs.readFile(TOKEN_PATH, function (err, token) {
    if (err) {
      getNewToken(oauth2Client, callback);
    } else {
      oauth2Client.credentials = JSON.parse(token);
      callback(oauth2Client);
    }
  });
}

/**
 * Get and store new token after prompting for user authorization, and then
 * execute the given callback with the authorized OAuth2 client.
 *
 * @param {google.auth.OAuth2} oauth2Client The OAuth2 client to get token for.
 * @param {getEventsCallback} callback The callback to call with the authorized
 *     client.
 */
function getNewToken(oauth2Client, callback) {
  var authUrl = oauth2Client.generateAuthUrl({
    access_type: "offline",
    scope: SCOPES,
  });
  console.log("Authorize this app by visiting this url: ", authUrl);
  var rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  rl.question("Enter the code from that page here: ", function (code) {
    rl.close();
    oauth2Client.getToken(code, function (err, token) {
      if (err) {
        console.log("Error while trying to retrieve access token", err);
        return;
      }
      oauth2Client.credentials = token;
      storeToken(token);
      callback(oauth2Client);
    });
  });
}

/**
 * Store token to disk be used in later program executions.
 *
 * @param {Object} token The token to store to disk.
 */
function storeToken(token) {
  try {
    fs.mkdirSync(TOKEN_DIR);
  } catch (err) {
    if (err.code != "EEXIST") {
      throw err;
    }
  }
  fs.writeFile(TOKEN_PATH, JSON.stringify(token), (err) => {
    if (err) throw err;
    console.log("Token stored to " + TOKEN_PATH);
  });
}
/**END from google api quick start - used for authorization**/

//fetches youtube playlist data from graphql server
async function getYoutubePlaylist() {
  let playlistID = "PLqlSkpL5iB05v9G5Xw_H1jfCm31vqqr0t";
  let query = `
  query {
    video(playlistID: "${playlistID}") {
      snippet{
        resourceId{
          videoId
        }
      }
    }
  }`;
  console.log(query);
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      query,
    }),
  });
  const result = await response.json();
  const info = result.data.video;
  console.log(info);
  return info;
}

//returns array of urls
async function getPlaylistVideoUrls() {
  let videos = await getYoutubePlaylist();
  let arrayOfAllVideos = [];
  videos.forEach((element) => {
    let youtubeId = element.snippet.resourceId.videoId;
    let youtubeUrl = `https://www.youtube.com/watch?v=${youtubeId}`;
    arrayOfAllVideos.push(youtubeUrl);
  });
  console.log(arrayOfAllVideos);
  return arrayOfAllVideos;
}

//get video artist and song name array
async function getVideoInfo() {
  let videoUrls = await getPlaylistVideoUrls();
  let youtubeData = [];
  for (var i = 0; i < videoUrls.length; i++) {
    youtubeData.push(getYoutubeData(videoUrls[i]));
  }
  return Promise.all(youtubeData)
    .then((results) => {
      return results;
    })
    .catch((err) => {
      console.log("error");
    });
}

//returns a JSON object containing artist and song name
function getYoutubeData(videoUrls) {
  return new Promise((resolve) => {
    youtubedl.getInfo(videoUrls, function (err, info) {
      if (err) {
        throw err;
      }
      return resolve({ artist: info.artist, songName: info.track });
    });
  });
}

//gets the spotify track URI from the extracted youtube data
async function collectUri() {
  let videoData = await getVideoInfo();
  let artist;
  let songName;
  let uriArray = [];
  for (var i = 0; i < videoData.length; i++) {
    artist = videoData[i].artist;
    songName = videoData[i].songName;
    uriArray.push(getSpotifyUri(songName, artist));
  }
  return Promise.all(uriArray)
    .then((results) => {
      return results;
    })
    .catch((err) => {
      console.log("error here", err);
    });
}

//generates the spotify uri fetching from graphql server
async function getSpotifyUri(songName, artist) {
  let query = `
  query {
    track(songTitle: "${songName}", artist: "${artist}") {
      uri
    }
  }`;
  console.log(query);

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      query,
    }),
  });
  const result = await response.json();
  const info = result.data.track[0].uri;
  console.log(info);
  return info;
}

//creates new spotify playlist via graphql server
async function createSpotifyPlaylist() {
  let name = "Playlist 1";
  let query = `
  mutation {
    createPlaylist(byName: "${name}") {
      id
    }
  }`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      query,
    }),
  });
  const result = await response.json();
  const playlistId = result.data.createPlaylist.id;
  console.log(playlistId);
  return playlistId;
}

//add songs to newly created spotify playlist via graphql server
async function addSongToSpotifyPlaylist() {
  let playlistId = await createSpotifyPlaylist();
  let trackUris = (await collectUri()).toString();
  console.log("tracks added: ", trackUris);
  console.log("to playlist: ", playlistId);

  let query = `
  query {
    add(playlistId: "${playlistId}", trackUris: "${trackUris}") {
      snapshot_id
    }
  }`;
  console.log(query);

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      query,
    }),
  });
  const result = await response.json();
  const info = result.data.add.snapshot_id;
  console.log(info);
  return info;
}

