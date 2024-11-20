import { streamText, tool } from 'ai';
import { openai } from '@ai-sdk/openai';
import { findRelevantContent } from '@/lib/mongoDbRetriever';
import { z } from 'zod';


export async function POST(request: Request) {

    const { messages, useTools } = await request.json();
    console.log(`useTools: ${useTools}`);
    const latestMessage = messages[messages?.length - 1]?.content;
    console.log(`latestMessage: ${latestMessage}`);

    console.log('messages:-------------------');
    messages?.map((msg: any) => (
        console.log(`role: ${msg.role}, content: ${msg.content ? msg.content.slice(0, 100) + '...' : 'undefined'}`)
    ));
    
    let context = '';
    if (!useTools) {
        const content = await findRelevantContent(latestMessage);
        context = content.map(doc => doc.pageContent).join('\n\n');
    }

    const systemPrompt = `You are knowledgeable about Elastic Path products. You can answer any questions about 
            Commerce Manager, 
            Product Experience Manager also known as PXM,
            Cart and Checkout,
            Promotions,
            Composer,
            Payments
            Subscriptions,
            Studio.
            Check Elastic Path knowledge base before answering any questions.
            
            ${useTools ? `Only respond to questions using information from tool calls.   
            if no relevant information is found in the tool calls, respond, "Sorry, I don't know."
            ` : `
            Answer the following question based on the context:
            Question: ${latestMessage}
            Context: ${context}
            if no relevant information is found, respond, "Sorry, I don't know."
            `}
                
            From the documents returned, after you have answered the question, provide a list of links to the documents that are most relevant to the question.
            Build any of the relative links doing the following:
            - remove the /data_md/ prefix
            - remove the .md suffix
            - replace spaces with hyphens
            using https://elasticpath.dev as the root
            
            Answer the question in a helpful and comprehensive way.`;

    let result;

    if (!useTools) {
        result =  streamText({
            model: openai('gpt-4o'),
            messages: [{ role: 'system', content: systemPrompt }, ...messages],
        });
    }

    result = streamText({
        model: openai('gpt-4o'),
        messages: [
            { role: "system", content: systemPrompt },
            ...messages
        ],
        maxSteps: 3,
        tools: {
            getContent: tool({
                description: 'get content from Elastic Path knowledge base',
                parameters: z.object({
                    latestMessage: z.string().describe('the users question'),
                }),
                execute: async ({ latestMessage }) => findRelevantContent(latestMessage),
            })
        },
        onFinish: ({ usage }) => {
            const { promptTokens, completionTokens, totalTokens } = usage;
            console.log('Prompt tokens:', promptTokens);
            console.log('Completion tokens:', completionTokens);
            console.log('Total tokens:', totalTokens);
        },
    });

    return result.toDataStreamResponse();

}


