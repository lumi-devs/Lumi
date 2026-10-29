import { DiscordAPIError, HTTPError, RESTJSONErrorCodes } from "discord.js";
import { ephemeralCard, makeErrorCard, type CardReply } from "@lumi/ui";

function messageForDiscordCode(code: number): string | null {
  switch (code) {
    case RESTJSONErrorCodes.UnknownChannel:
      return "That channel no longer exists.";
    case RESTJSONErrorCodes.UnknownGuild:
      return "This server is no longer available.";
    case RESTJSONErrorCodes.UnknownMember:
      return "That member is no longer in the server.";
    case RESTJSONErrorCodes.UnknownMessage:
      return "That message no longer exists.";
    case RESTJSONErrorCodes.UnknownRole:
      return "That role no longer exists.";
    case RESTJSONErrorCodes.UnknownUser:
      return "That user could not be found.";
    case RESTJSONErrorCodes.MissingAccess:
      return "I don't have access to do that here.";
    case RESTJSONErrorCodes.MissingPermissions:
      return "I'm missing the permissions to do that.";
    case RESTJSONErrorCodes.CannotSendMessagesToThisUser:
      return "I can't message that user - their DMs are closed.";
    default:
      return null;
  }
}

function messageForHttpStatus(status: number): string | null {
  switch (status) {
    case 500:
      return "Discord ran into an internal error. Please try again shortly.";
    case 502:
    case 504:
      return "Discord's gateway is unavailable right now. Please try again shortly.";
    case 503:
      return "Discord is temporarily unavailable. Please try again shortly.";
    default:
      return null;
  }
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function commandErrorCard(error: unknown): CardReply {
  if (error instanceof DiscordAPIError) {
    return ephemeralCard(
      makeErrorCard(
        "Action Failed",
        messageForDiscordCode(Number(error.code)) ??
          "Discord rejected that action.",
      ),
    );
  }
  if (error instanceof HTTPError) {
    return ephemeralCard(
      makeErrorCard(
        "Discord Unavailable",
        messageForHttpStatus(error.status) ??
          "Discord is having issues. Please try again shortly.",
      ),
    );
  }
  if (error instanceof Error && error.name === "AbortError") {
    return ephemeralCard(
      makeErrorCard(
        "Timed Out",
        "That took too long and was cancelled. Please try again.",
      ),
    );
  }
  return ephemeralCard(
    makeErrorCard("Unexpected Error", "An unexpected error occurred."),
  );
}
