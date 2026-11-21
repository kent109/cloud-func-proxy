// netlify/functions/hello.mts
import type { Context, Config } from "@netlify/functions";

export default async (req: Request, context: Context) => {
    return new Response(JSON.stringify({
        message: "Hello from Netlify!",
        method: req.method
    }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
    });
};