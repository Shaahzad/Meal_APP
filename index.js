import { eq, ilike } from "drizzle-orm";
import {db} from "./db/index.js"
import {todosTable} from "./db/schema.js"
import OpenAI from "openai";
import readlinesync from "readline-sync"

const client = new OpenAI();


async function getAllTodo() {
    const todos = await db.select().from(todosTable)
    return todos;
}

async function createTodo(todo) {
    const [result] = await db.insert(todosTable).values({
        todo,
    }).returning({
        id: todosTable.id
    });
    return result.id;
}

async function searchTodo(search) {
    const todos = await db.select().from(todosTable).where(ilike(todosTable.todo, search))
    return todos;
}

async function DeleteTodoById(id) {
    await db.delete(todosTable).where(eq(todosTable.id, id))
}


const tools = {
    getAllTodo: getAllTodo,
    createTodo: createTodo,
    searchTodo: searchTodo,
    DeleteTodoById: DeleteTodoById
}

const SYSTEM_PROMPT = `
You are an AI TO-DO List Assistant with START, PLAN, ACTION, Observation and Output State.
Wait for the user prompt and first PLAN using available tools.
After Planning, Take the action with appropriate tools and wait for Observation based on Action.
Once you get te Observations, Return the AI response based on START prompt and Observations.   

You are an AI To-Do List Assistant. You can manage task by adding, viewing, updating, and deleting them.
You must strictly follow the JSON output format.

Todo DB Schema:
id: Int and Primary Key
todo: String
created_at: Date Time
updated_at: Date Time

Available Tools:
- getAllTodo(): return all the todo from database 
- createTodo(todo: string): create a new todo in the db and takes todo as a string and return the ID of created todo
- DeleteTodoById(id: string): Delete the todo by id given in the DB
- searchTodo(query: string): Searches for all the todo matching query string using ilike operator 


Example:
START
{"type": "user", "user": "Add a task for sopping groceries."}
{"type": "plan", "plan": "I will try to get more context on what user needs to shop."}
{"type": "output", "output": "Can you tell me what all items you want to shop for?"}
{"type": "user", "user": "I want to shop for milk, kurkure, lays and chocolates."}
{"type": "plan", "plan": "I will use createTodo to create a new todo in DB"}
{"type": "action", "function": "createTodo", "input": "Shopping for milk, kurkure, lays and choco."}
{"type": "observation", "observation": "2"}
{"type": "output", "output": "Your todo has been added Successfully"}
`

const messages = [{role: 'system', content: SYSTEM_PROMPT}]

while (true) {
    const query = readlinesync.question('--> ');
    const userMessage = {
        type: 'user',
        user: query,
    };
    messages.push({role: 'user', content: JSON.stringify(userMessage)});

    while (true) {
        const chat = await client.chat.completions.create({
            model: 'gpt-4o',
            messages: messages,
            response_format: {type: 'json_object'}
        });
        const result = chat.choices[0].message.content;
        messages.push({role: 'assistant', content: result});
        const action = JSON.parse(result)
        if(action.type === 'output'){
            console.log(`🤖 ${action.output}`)
            break;
        }
        else if(action.type === 'output'){
            const fn = tools[action.function];
            if(!fn) throw new Error('Invalid Tool Call')
            const observation = await fn(action.input)
            const observationMessage = {
                type: 'observation',
                observation: observation
            };
            messages.push({role: 'developer', content: JSON.stringify(observationMessage)});
        }
    }
}