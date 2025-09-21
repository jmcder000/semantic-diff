# Semantic Diff

**🏆 3rd Place Winner - AGI House Productivity Hackathon**

An intelligent document analysis tool that performs semantic comparison between original documents and their summaries, providing a quick way for users to get insights into faithfullness and accuracy of summaries.

## Overview

Semantic Diff is a full-stack application designed to help legal professionals, researchers, and content auditors understand how well summaries capture the essence of original documents. It uses advanced AI models to generate intent-driven summaries, extract critical questions, and measure semantic similarity between original and summarized content.

## Key Features

- **Intent-Driven Analysis**: Generate summaries optimized for specific purposes or intents
- **Automatic Question Generation**: Extracts 5-8 critical questions answerable with the original document based on the specified intent
- **Visual Highlighting**: Interactive text highlighting showing where questions are answered in both original and summary
- **Semantic Similarity Scoring**: Uses embedding models to compute similarity between original and summarized answers
- **Citation Tracking**: Precise line/column tracking for all extracted quotes and answers
- **Robust Text Matching**: Advanced fuzzy matching algorithms handle various text formatting issues

## Technical Architecture

### Backend (Node.js/Express)

The backend server (`backend/server/server.js`) provides a REST API endpoint that orchestrates multiple AI operations:

1. **Question Extraction**: Uses OpenAI GPT models to generate intent-guided questions from the original document
2. **Summary Generation**: Creates a concise summary optimized for the specified intent
3. **Answer Mapping**: Identifies where each question is answered in the generated summary
4. **Similarity Analysis**: Computes semantic similarity using text embeddings

Key technical features:
- Structured output using Zod schemas for type safety
- Robust text matching with multiple fallback strategies (exact, case-insensitive, normalized, Levenshtein distance, word coverage)
- Efficient batch embedding processing
- Precise character-level citation tracking

### Frontend (React/Vite)

The frontend (`frontend/semantic-diff-web`) provides an intuitive interface for document analysis:

- **Modern React application** with Vite for fast development
- **Tailwind CSS** for responsive, professional styling
- **Interactive highlighting** system with color-coded similarity scores
- **Auditor mode** for side-by-side document comparison
- **Context preview** modal for viewing original text snippets

## Installation & Setup

### Prerequisites
- Node.js (v18 or higher)
- OpenAI API key

### Backend Setup

```bash
cd backend/server
npm install
```

Create a `.env` file:
```
OPENAI_API_KEY=your_api_key_here
PORT=5001
OPENAI_GEN_MODEL=gpt-4o-mini
OPENAI_SUM_MODEL=gpt-4o-mini
OPENAI_EMB_MODEL=text-embedding-3-large
```

Start the server:
```bash
npm run dev  # Development mode with hot reload
# or
npm start    # Production mode
```

### Frontend Setup

```bash
cd frontend/semantic-diff-web
npm install
npm run dev
```

The application will be available at `http://localhost:5173`

## Usage

1. **Enter an Intent**: Describe what aspects of the document you want to focus on (e.g., "business impact and key risks")

2. **Paste Original Document**: Input the source text you want to analyze

3. **Generate Analysis**: Click "Get semantic diff" to process the document

4. **Review Results**:
   - **Summary Panel**: Shows the generated summary with color-coded highlights indicating similarity scores
   - **Question Table**: Detailed breakdown of each question, its significance, and how it's answered in both documents
   - **Interactive Features**: Hover over highlights to see original quotes, click for context preview

## Similarity Scoring

The system uses a multi-tier similarity assessment:
- **MATCH** (≥88%): High semantic similarity
- **PARTIAL** (60-87%): Moderate similarity with some variance
- **MISMATCH** (<60%): Significant semantic difference
- **NO_ANSWER**: Question not addressed in summary

## Technology Stack

- **Backend**: Node.js, Express.js, OpenAI API, Zod validation
- **Frontend**: React, Vite, Tailwind CSS
- **AI Models**: GPT-4o-mini, text-embedding-3-large
- **Development**: ESLint, Nodemon, PostCSS

## About the Hackathon

This project was developed for the AGI House Productivity Hackathon. The hackathon challenged participants to create tools that enhance productivity using AI technologies. Semantic Diff addresses the critical need for accurate document summarization verification in legal and business contexts, where information fidelity is paramount.

## Future Enhancements

- Support for multiple document formats (PDF, Word)
- Batch processing capabilities
- Custom model selection
- Export functionality for reports
- Historical comparison tracking

## License

This project was created for the AGI House Productivity Hackathon.

## Readme auto-generated via Claude Code