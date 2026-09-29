import { describe, expect, it } from "vitest";
import { latestPostIn, usersFromResponse } from "./twitter-follows";

// Trimmed from the shape of X's Following response: timeline entries whose
// user_results hold User objects. X has moved fields out of `legacy` twice
// (handle, name and join date into `core`, then everything else, as seen in
// September 2026); every shape must read the same.
const entry = (user: object) => ({ content: { itemContent: { user_results: { result: user } } } });
const following = {
  data: {
    user: {
      result: {
        timeline: {
          timeline: {
            instructions: [
              {
                type: "TimelineAddEntries",
                entries: [
                  entry({
                    __typename: "User",
                    rest_id: "111",
                    core: { screen_name: "newshape", name: "New Shape", created_at: "Wed Oct 10 20:19:24 +0000 2018" },
                    avatar: { image_url: "https://pbs.twimg.com/profile_images/1/a.jpg" },
                    relationship_perspectives: { followed_by: true, following: true },
                    legacy: { description: "hi", followers_count: 1200, friends_count: 300, statuses_count: 4500 },
                  }),
                  entry({
                    __typename: "User",
                    rest_id: "222",
                    legacy: {
                      screen_name: "oldshape",
                      name: "Old Shape",
                      created_at: "Mon Jan 01 00:00:00 +0000 2024",
                      description: "",
                      followers_count: 12,
                      friends_count: 4800,
                      statuses_count: 3,
                      default_profile_image: true,
                    },
                  }),
                  entry({
                    __typename: "User",
                    rest_id: "333",
                    core: { screen_name: "noLegacy", name: "No Legacy", created_at: "Sat Aug 07 03:40:11 +0000 2010" },
                    avatar: { image_url: "https://abs.twimg.com/sticky/default_profile_images/default_profile_normal.png" },
                    profile_bio: { description: "2026 shape" },
                    relationship_counts: { followers: 4_120_906, following: 295 },
                    tweet_counts: { tweets: 18_216, media_tweets: 357 },
                    relationship_perspectives: { followed_by: false, following: true },
                  }),
                  { content: { cursorType: "Bottom", value: "abc" } },
                ],
              },
            ],
          },
        },
      },
    },
  },
};

describe("reading X's Following data", () => {
  it("reads users in both the old and the new shape", () => {
    expect(usersFromResponse(following)).toEqual([
      {
        id: "111",
        handle: "newshape",
        name: "New Shape",
        bio: "hi",
        followers: 1200,
        following: 300,
        posts: 4500,
        createdAt: "2018-10-10T20:19:24.000Z",
        defaultAvatar: false,
        followsYou: true,
      },
      {
        id: "222",
        handle: "oldshape",
        name: "Old Shape",
        bio: "",
        followers: 12,
        following: 4800,
        posts: 3,
        createdAt: "2024-01-01T00:00:00.000Z",
        defaultAvatar: true,
        followsYou: false,
      },
      {
        id: "333",
        handle: "noLegacy",
        name: "No Legacy",
        bio: "2026 shape",
        followers: 4_120_906,
        following: 295,
        posts: 18_216,
        createdAt: "2010-08-07T03:40:11.000Z",
        defaultAvatar: true,
        followsYou: false,
      },
    ]);
  });

  it("returns nothing, rather than guessing, for data it doesn't recognise", () => {
    expect(usersFromResponse({ data: { something: [{ __typename: "User" }] } })).toEqual([]);
    expect(usersFromResponse(null)).toEqual([]);
  });
});

describe("reading a profile's latest post", () => {
  const tweet = (userId: string, id: string, createdAt: string) => ({
    __typename: "Tweet",
    rest_id: id,
    legacy: { id_str: id, user_id_str: userId, created_at: createdAt },
  });

  it("takes the newest post or repost by that user, ignoring others'", () => {
    const timeline = {
      entries: [
        tweet("111", "1", "Mon Jan 01 00:00:00 +0000 2024"),
        // A repost: the outer post is theirs (dated when they reposted), the original isn't.
        {
          ...tweet("111", "2", "Sat Mar 01 00:00:00 +0000 2025"),
          retweeted: tweet("999", "3", "Fri Jun 06 00:00:00 +0000 2025"),
        },
      ],
    };
    expect(latestPostIn(timeline, "111")).toBe("2025-03-01T00:00:00.000Z");
    expect(latestPostIn(timeline, "555")).toBeUndefined();
  });
});
