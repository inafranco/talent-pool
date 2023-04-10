import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  ScanCommand,
  PutCommand,
  GetCommand,
  DeleteCommand,
} from "@aws-sdk/lib-dynamodb";
import {
  EventBridgeClient,
  PutEventsCommand,
} from "@aws-sdk/client-eventbridge";
import { Handler } from "aws-lambda";
import { v4 as newID } from "uuid";

const dynamoClient = new DynamoDBClient({});
const dynamo = DynamoDBDocumentClient.from(dynamoClient);

const tableName = "talents";

const ebClient = new EventBridgeClient({ region: "us-east-1" });
export const handler: Handler = async (event, context) => {
  let body;
  let statusCode = 200;
  const headers = {
    "Content-Type": "application/json",
  };

  try {
    switch (event.routeKey) {
      case "DELETE /talents/{id}":
        await dynamo.send(
          new DeleteCommand({
            TableName: tableName,
            Key: {
              id: event.pathParameters.id,
            },
          })
        );
        body = `Deleted talent ${event.pathParameters.id}`;
        break;
      case "GET /talents/{id}":
        body = await dynamo.send(
          new GetCommand({
            TableName: tableName,
            Key: {
              id: event.pathParameters.id,
            },
          })
        );
        body = body.Item;
        if (!body) {
          statusCode = 404;
          body = "Talent not found.";
        }
        break;
      case "GET /talents":
        body = await dynamo.send(new ScanCommand({ TableName: tableName }));
        body = body.Items;
        break;
      case "PUT /talents":
        let talentJSON = JSON.parse(event.body);
        talentJSON.id = newID();
        await dynamo.send(
          new PutCommand({
            TableName: tableName,
            Item: talentJSON,
          })
        );
        body = `Registered talent ${talentJSON.id}`;
        const params = {
          Entries: [
            {
              Detail: body,
              DetailType: "talent",
              Source: "Talent-Pool lambda function",
              EventBusName: "talent-registered",
            },
          ],
        };
        const data = await ebClient.send(new PutEventsCommand(params));
        console.log("Success, Registered-Talent event sent; requestID:", data);
        break;
      case "PUT /subscribe":
        let subscriberJSON = JSON.parse(event.body);
        subscriberJSON.id = newID();
        await dynamo.send(
          new PutCommand({
            TableName: "subscribers",
            Item: subscriberJSON,
          })
        );
        body = `Subscribed to be notified of talents with skills: ${subscriberJSON.skills}`;
        break;
      default:
        throw new Error(`Unsupported route: "${event.routeKey}"`);
    }
  } catch (err: any) {
    statusCode = 400;
    body = err.message;
  } finally {
    body = JSON.stringify(body);
  }

  return {
    statusCode,
    body,
    headers,
  };
};
