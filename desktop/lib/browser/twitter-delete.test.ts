import { describe, expect, it } from "vitest";
import { repliesToOthersIn } from "./twitter-delete";

// Trimmed from X's UserRepliesTimeline (September 2026): the Replies tab's
// data holds the posts replied to as well as the user's replies.
const me = "2103785336371363840";
const post = (id: string, user: string, replyToUser?: string) => ({
  __typename: "Tweet",
  rest_id: id,
  legacy: { id_str: id, user_id_str: user, ...(replyToUser ? { in_reply_to_user_id_str: replyToUser, in_reply_to_status_id_str: "1" } : {}) },
});
const timeline = {
  data: {
    entries: [
      post("100", "37021391"), // someone's post the user replied to
      post("101", me, "37021391"), // the user's reply to them
      post("102", me), // the user's own post
      post("103", me, me), // the user continuing their own thread
      post("104", "555", "999"), // someone else's reply
    ],
  },
};

describe("finding replies in X's data", () => {
  it("returns only the user's replies to other people", () => {
    expect(repliesToOthersIn(timeline, me)).toEqual(["101"]);
  });

  it("finds nothing in data it doesn't recognise", () => {
    expect(repliesToOthersIn({ data: {} }, me)).toEqual([]);
    expect(repliesToOthersIn(null, me)).toEqual([]);
  });
});
