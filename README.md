# Scrawl

A real-time collaborative drawing app - like WhatsApp, but you draw.

---

## Overview

Scrawl is a messaging app where the medium is a canvas. Create 1:1 or group rooms, then communicate through freehand drawings, shapes, text, images, and voice recordings - all synced live across everyone in the room.

Instead of sending text messages, you build something together on a shared canvas and send it when it's ready.

---

## Features

### Real-Time Collaboration
- Shared canvas synced live across all users
- 1:1 chats and group rooms
- Multiple users can draw and interact simultaneously

### Drawing Tools
- **Freehand drawing**: pencil tool with configurable brush size and colour
- **Shapes**: rectangles, circles, arrows, and lines with stroke and fill
- **Text**: place typed notes anywhere on the canvas
- **Image uploads**: embed photos directly onto the canvas

### Messaging
- **Audio messages**: record and play back voice notes inline
- Canvas-based conversation flow
- Visual communication instead of traditional text messaging

### User System
- Login and signup authentication
- Usernames for identification
- View all usernames in one place
- Responsive authentication pages

### Canvas Controls
- Canvas draw restrictions to prevent unwanted edits
- Smooth real-time synchronization

### UI Improvements
- Cleaner and more polished interface
- Improved layout and visual design
- Tooltip fixes for better usability
- Fully responsive login and signup pages

---

## Technology Stack

### Frontend
- React
- HTML5 Canvas API
- CSS

### Backend
- Node.js
- Express

### Real-Time Communication
- Socket.io

### Authentication / Database
- Supabase

---
## Architecture 
 ```mermaid
flowchart LR

%% USERS
U[Users]

%% FRONTEND
subgraph Frontend [React Frontend]
A1[Canvas UI]
A2[Drawing Tools\nPencil / Shapes / Text]
A3[Chat Interface]
A4[Media Upload\nImages / Audio]
A5[Socket Client]
end

%% BACKEND
subgraph Backend [Node.js + Express Backend]
B1[Socket.io Server]
B2[Room Manager]
B3[Canvas Sync Engine]
B4[Message Handler]
B5[Media Processing]
end

%% DATABASE
subgraph Supabase
C1[Authentication]
C2[Database Storage]
end

%% CONNECTIONS
U --> A1
U --> A3

A1 --> A5
A2 --> A5
A3 --> A5
A4 --> A5

A5 --> B1

B1 --> B2
B1 --> B3
B1 --> B4
B1 --> B5

B2 --> C2
B4 --> C2
B5 --> C2

B1 --> C1
```
---

## Installation

Clone the repository:

```bash
git clone https://github.com/yourusername/scrawl.git
cd scrawl
```
Install dependencies:

```bash
npm install
```
Run the development server:

```bash
cd backend
node index.js

cd frontend
npm run dev
```
Open in browser:

```bash
http://localhost:5173
```


## Future Scope

- Lazy loading for improved performance
- Start chat view from the most recent message
- Performance improvements for large rooms
- Additional collaboration tools

## Contributors
- Sheetal Lodhi
- Mariam Eqbal

## License
- This project is developed for academic and learning purposes.


