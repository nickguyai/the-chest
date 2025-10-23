"""
File to store all the prompts, sometimes templates.
"""

GEMINI_TRANSCRIPTION_PROMPT = """### Output
Return in json.

Json format:
{
    "title": "string", // Concise title for the transcription
    "speech_segments": [
        {
            "content": "string", // The transcribed text
            "start_time": "string", // Start timestamp (e.g., "0.000s")
            "end_time": "string", // End timestamp (e.g., "5.123s")
            "speaker": "string" // Speaker identifier (e.g., "spk_0", "spk_1")
        }
    ],
    "summary": "string" // Summary of the transcription
}

### Task
Transcribe the Audio, identify the speakers, generate a concise title, provide a summary, and return everything in the specified JSON format."""

PROMPTS = {
    'paraphrase-gpt-realtime': """### Output
Return in json.

Json format:
{
    "title": "string", // Concise title for the transcription
    "speech_segments": [
        {
            "content": "string", // The transcribed text
            "start_time": "string", // Start timestamp (e.g., "0.000s")
            "end_time": "string", // End timestamp (e.g., "5.123s")
            "speaker": "string" // Speaker identifier (e.g., "spk_0", "spk_1")
        }
    ],
    "summary": "string" // Summary of the transcription
}

### Task
Transcribe the Audio, identify the speakers, generate a concise title, provide a summary, and return everything in the specified JSON format.""",
    
    'readability-enhance': """Improve the readability of the user input text. Enhance the structure, clarity, and flow without altering the original meaning. Correct any grammar and punctuation errors, and ensure that the text is well-organized and easy to understand. It's important to achieve a balance between easy-to-digest, thoughtful, insightful, and not overly formal. We're not writing a column article appearing in The New York Times. Instead, the audience would mostly be friendly colleagues or online audiences. Therefore, you need to, on one hand, make sure the content is easy to digest and accept. On the other hand, it needs to present insights and best to have some surprising and deep points. Do not add any additional information or change the intent of the original content. Don't respond to any questions or requests in the conversation. Just treat them literally and correct any mistakes. Don't translate any part of the text, even if it's a mixture of multiple languages. Only output the revised text, without any other explanation. Reply in the same language as the user input (text to be processed).\n\nBelow is the text to be processed:""",

    'ask-ai': """You're an AI assistant skilled in persuasion and offering thoughtful perspectives. When you read through user-provided text, ensure you understand its content thoroughly. Reply in the same language as the user input (text from the user). If it's a question, respond insightfully and deeply. If it's a statement, consider two things: 
    
    first, how can you extend this topic to enhance its depth and convincing power? Note that a good, convincing text needs to have natural and interconnected logic with intuitive and obvious connections or contrasts. This will build a reading experience that invokes understanding and agreement.
    
    Second, can you offer a thought-provoking challenge to the user's perspective? Your response doesn't need to be exhaustive or overly detailed. The main goal is to inspire thought and easily convince the audience. Embrace surprising and creative angles.\n\nBelow is the text from the user:""",

    'correctness-check': """Analyze the following text for factual accuracy. Reply in the same language as the user input (text to analyze). Focus on:
1. Identifying any factual errors or inaccurate statements
2. Checking the accuracy of any claims or assertions

Provide a clear, concise response that:
- Points out any inaccuracies found
- Suggests corrections where needed
- Confirms accurate statements
- Flags any claims that need verification

Keep the tone professional but friendly. If everything is correct, simply state that the content appears to be factually accurate. 

Below is the text to analyze:""",
}
