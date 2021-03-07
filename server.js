const express = require("express");
const app = express();
const { graphqlHTTP } = require('express-graphql');
const { buildSchema } = require('graphql')
const { spotifyToken, spotifyUserId } = require("./spotify_secrets");
const superagent = require("superagent");
const { google } = require("googleapis");
const cs = require("./client_secret.json");

let schema = buildSchema(`
    type Artist {
        id: String
        genres: [String]
        href: String
        name: String
        popularity: Int
        type: String
        uri: String
    }

    type Track {
      id: String
      name: String
      uri: String
      artists: [Artist]
    }

    type Playlist {
      id: String
      name: String
      uri: String
    }

    type Query {
        artist (artist: String): [Artist],
        track (artist: String, songTitle: String): [Track]
        video (playlistID: String): [YoutubeVideo]
        add (playlistId: String, trackUris: String) : SnapshotId
    }

    type YoutubeVideo {
      id: String
      snippet: Snippet
    }

    type Snippet {
      title: String
      resourceId: ResourceId
    }

    type ResourceId {
      videoId: String
    }

    type SnapshotId {
      snapshot_id: String
    }

    type Mutation {
      createPlaylist (byName: String): Playlist
    }
`)

let root = {    
    artist: ( {artist} ) => {
        return getArtist(artist);
    },
    track: ( {songTitle, artist} ) => {
      return getTrack(songTitle, artist)
    },
    createPlaylist: ( {byName} ) => {
      return createPlaylist(byName)
    },
    video: ( {playlistID} ) => {
      return getYoutubePlaylist(playlistID)
    },
    add: ( {playlistId, trackUris} ) => {
      return addSongToSpotifyPlaylist(playlistId, trackUris)
    }
}

function getYoutubePlaylist(playlistID) {
  let playlistItems;
  let service = google.youtube("v3");
  return new Promise((resolve, reject) => {
    service.playlistItems.list(
      {
        key: cs.web.api_key,
        part: ["id, snippet"],
        maxResults: 25,
        playlistId: `${playlistID}`,
      },
      function (err, response) {
        if (err) {
          console.log("The API returned an error: " + err);
          reject("The API returned an error: " + err);
          return;
        }
        playlistItems = response.data.items;
        resolve(playlistItems);
        console.log(playlistItems)
      }
    );
  });
}

function getArtist(artist) {
  return new Promise((resolve, reject) => {
    superagent
      .get(
        `https://api.spotify.com/v1/search?q=artist%3A${artist}&type=artist&limit=1`
      )
      .set({
        "Content-Type": "application/json",
        Authorization: `Bearer ${spotifyToken}`,
      })
      .end((err, res) => {
        if (err) {
          console.log(err);
          reject(err);
        }
        return resolve(res.body.artists.items);
      });
  });
}

function getTrack(songName, artist) {
  let track = songName.replace(/\s/g, "%20");
  let artistNoSpace = artist.replace(/\s/g, "%20");
  return new Promise((resolve, reject) => {
    superagent
      .get(
        `https://api.spotify.com/v1/search?q=track%3A${track}+artist%3A${artistNoSpace}&type=track&limit=1`
      )
      .set({
        "Content-Type": "application/json",
        Authorization: `Bearer ${spotifyToken}`,
      })
      .end((err, res) => {
        if (err) {
          console.log(err);
          reject(err);
        }
        console.log(track)
        console.log(artistNoSpace)
        return resolve(res.body.tracks.items);
      });
  });
}

function createPlaylist(byName) {
  return new Promise((resolve, reject) => {
    superagent
      .post(`https://api.spotify.com/v1/users/${spotifyUserId}/playlists`)
      .send({
        name: `"${byName}"`,
        description: "Playlist generated from Youtube playlist",
        public: false,
      })
      .set({
        "Content-Type": "application/json",
        Authorization: `Bearer ${spotifyToken}`,
      })
      .end((err, res) => {
        if (err) {
          console.log(err);
          reject(err);
        }
        console.log(res.body)
        return resolve(res.body);
      });
  });
}

function addSongToSpotifyPlaylist(playlistId, trackUris) {
  return new Promise((resolve,reject) => {
    superagent
    .post(
      `https://api.spotify.com/v1/playlists/${playlistId}/tracks?uris=${trackUris}`
    )
    .set({
      "Content-Type": "application/json",
      Authorization: `Bearer ${spotifyToken}`,
    })
    .end((err, res) => {
      if (err) {
        console.log(err);
        reject(err);
      }
      return resolve(res.body);
    });
  })
}

app.use('/graphql', graphqlHTTP({
    schema: schema,
    rootValue: root,
    graphiql: true,
    pretty: true
  }));

app.listen(4000);
  console.log('Running a GraphQL API server at http://localhost:4000/graphql');