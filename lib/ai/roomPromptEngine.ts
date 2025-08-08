interface RoomMessage {
  id: string;
  sender_name: string;
  content: string;
  is_ai_response: boolean;
  created_at: string;
  thread_id: string;
}

interface UserProfile {
  name: string;
  messageCount: number;
  averageMessageLength: number;
  communicationStyle: 'formal' | 'casual' | 'technical' | 'friendly' | 'direct';
  emotionalTone: 'positive' | 'neutral' | 'negative' | 'mixed';
  topicInterests: string[];
  recentActivity: string[];
  relationshipToOthers: Map<string, 'collaborative' | 'questioning' | 'supportive' | 'neutral'>;
}

interface ConversationContext {
  roomName: string;
  participants: string[];
  conversationFlow: Array<{
    speaker: string;
    respondingTo?: string;
    messageType: 'question' | 'answer' | 'statement' | 'joke' | 'request' | 'greeting';
    emotionalContext: string;
  }>;
  currentTopic: string;
  conversationPhase: 'greeting' | 'exploration' | 'deep-discussion' | 'problem-solving' | 'casual-chat';
  groupDynamics: {
    activeParticipants: string[];
    quietParticipants: string[];
    conversationLeaders: string[];
    supportiveMembers: string[];
  };
}

export class RoomPromptEngine {
  private userProfiles: Map<string, UserProfile> = new Map();
  private conversationMemory: Map<string, string[]> = new Map(); // threadId -> key topics/decisions

  /**
   * Generate a sophisticated AI prompt with full conversational context
   */
  generatePrompt(
    messages: RoomMessage[],
    roomName: string,
    participants: string[],
    currentUser: string,
    currentMessage: string
  ): { system: string; messages: Array<{ role: 'user' | 'assistant'; content: string }> } {
    
    // Analyze conversation context
    const conversationContext = this.analyzeConversationContext(messages, roomName, participants);
    
    // Build user profiles from message history
    this.buildUserProfiles(messages);
    
    // Generate sophisticated system prompt
    const system = this.buildSystemPrompt(conversationContext, currentUser, currentMessage);
    
    // Format messages with rich context
    const formattedMessages = this.formatMessagesWithContext(messages, conversationContext);
    
    // Add current message
    formattedMessages.push({
      role: 'user' as const,
      content: this.formatCurrentMessage(currentUser, currentMessage, conversationContext)
    });

    return { system, messages: formattedMessages };
  }

  private buildSystemPrompt(context: ConversationContext, currentUser: string, currentMessage: string): string {
    const userProfile = this.userProfiles.get(currentUser);
    const groupDynamicsInsight = this.analyzeGroupDynamics(context);
    const conversationFlowInsight = this.analyzeConversationFlow(context);
    
    return `# AI Assistant for Group Chat Room: "${context.roomName}"

## CONVERSATION CONTEXT & DYNAMICS

### Current Situation
- **Room**: ${context.roomName}
- **Active Participants**: ${context.groupDynamics.activeParticipants.join(', ')}
- **Conversation Phase**: ${context.conversationPhase}
- **Current Topic**: ${context.currentTopic}
- **Latest Speaker**: ${currentUser} (just said: "${currentMessage.substring(0, 50)}...")

### Group Dynamics Analysis
${groupDynamicsInsight}

### Conversation Flow Insights
${conversationFlowInsight}

### Individual User Profiles
${this.generateUserProfileInsights(context.participants)}

## YOUR ROLE & BEHAVIOR

You are an emotionally intelligent AI assistant who:

### 🧠 **Contextual Awareness**
- **Remember**: Track conversation threads, references, and callbacks
- **Connect**: Link current messages to previous discussions and user patterns  
- **Anticipate**: Understand what users might need based on conversation flow

### 👥 **Multi-User Dynamics**
- **Address Specifically**: Use names when responding to specific people
- **Bridge Conversations**: Help connect ideas between different participants
- **Facilitate**: Encourage quiet members, moderate dominant speakers naturally
- **Adapt Tone**: Match the group's energy while being authentically helpful

### 🎭 **Personality & Tone Adaptation**
- **Mirror Communication Styles**: Adapt to each user's preferred communication style
- **Read the Room**: Understand if the conversation is serious, casual, technical, or playful
- **Cultural Sensitivity**: Recognize different cultural communication patterns
- **Emotional Intelligence**: Respond appropriately to frustration, excitement, confusion, etc.

### 💬 **Conversation Flow Management**
- **Build on Ideas**: Reference and expand on previous points made by users
- **Ask Follow-ups**: When appropriate, ask clarifying questions that move the conversation forward
- **Summarize**: Help synthesize complex discussions when needed
- **Transition**: Naturally guide conversation between topics when appropriate

### 🎯 **Response Guidelines**

**When to be Brief**: Quick questions, acknowledgments, or when conversation is flowing well
**When to be Detailed**: Complex topics, explanations, or when users seem confused
**When to be Supportive**: Users expressing frustration, uncertainty, or asking for help
**When to be Analytical**: Technical discussions, problem-solving, or decision-making scenarios

## CURRENT CONVERSATION ANALYSIS

**What's Happening**: ${this.analyzeCurrentMoment(context, currentUser, currentMessage)}

**Recommended Response Approach**: ${this.recommendResponseApproach(context, currentUser, currentMessage)}

---

Respond naturally as if you're a knowledgeable friend who has been following this entire conversation and understands each person's communication style and the group's dynamics.`;
  }

  private analyzeConversationContext(messages: RoomMessage[], roomName: string, participants: string[]): ConversationContext {
    const recentMessages = messages.slice(-20); // Analyze last 20 messages
    
    // Analyze conversation flow
    const conversationFlow = recentMessages.map(msg => {
      const messageType = this.categorizeMessage(msg.content);
      const emotionalContext = this.analyzeEmotionalContext(msg.content);
      const respondingTo = this.findResponseTarget(msg, recentMessages);
      
      return {
        speaker: msg.sender_name,
        respondingTo,
        messageType,
        emotionalContext
      };
    });

    // Determine current topic
    const currentTopic = this.extractCurrentTopic(recentMessages);
    
    // Analyze conversation phase
    const conversationPhase = this.determineConversationPhase(conversationFlow);
    
    // Analyze group dynamics
    const groupDynamics = this.analyzeGroupParticipation(conversationFlow, participants);

    return {
      roomName,
      participants,
      conversationFlow,
      currentTopic,
      conversationPhase,
      groupDynamics
    };
  }

  private buildUserProfiles(messages: RoomMessage[]): void {
    const userStats = new Map<string, { messages: RoomMessage[]; totalLength: number }>();
    
    // Collect user statistics
    messages.forEach(msg => {
      if (!msg.is_ai_response) {
        if (!userStats.has(msg.sender_name)) {
          userStats.set(msg.sender_name, { messages: [], totalLength: 0 });
        }
        const stats = userStats.get(msg.sender_name)!;
        stats.messages.push(msg);
        stats.totalLength += msg.content.length;
      }
    });

    // Build profiles
    userStats.forEach((stats, userName) => {
      const profile: UserProfile = {
        name: userName,
        messageCount: stats.messages.length,
        averageMessageLength: stats.totalLength / stats.messages.length,
        communicationStyle: this.analyzeCommunicationStyle(stats.messages),
        emotionalTone: this.analyzeOverallTone(stats.messages),
        topicInterests: this.extractTopicInterests(stats.messages),
        recentActivity: stats.messages.slice(-3).map(m => m.content.substring(0, 30)),
        relationshipToOthers: this.analyzeRelationships(userName, messages)
      };
      
      this.userProfiles.set(userName, profile);
    });
  }

  private categorizeMessage(content: string): 'question' | 'answer' | 'statement' | 'joke' | 'request' | 'greeting' {
    const lowerContent = content.toLowerCase();
    
    if (lowerContent.includes('?') || lowerContent.startsWith('how') || lowerContent.startsWith('what') || lowerContent.startsWith('why')) {
      return 'question';
    }
    if (lowerContent.includes('hello') || lowerContent.includes('hi') || lowerContent.includes('hey')) {
      return 'greeting';
    }
    if (lowerContent.includes('can you') || lowerContent.includes('could you') || lowerContent.includes('please')) {
      return 'request';
    }
    if (lowerContent.includes('haha') || lowerContent.includes('lol') || lowerContent.includes('😂')) {
      return 'joke';
    }
    if (lowerContent.includes('because') || lowerContent.includes('the answer') || lowerContent.includes('that\'s')) {
      return 'answer';
    }
    return 'statement';
  }

  private analyzeEmotionalContext(content: string): string {
    const lowerContent = content.toLowerCase();
    
    if (lowerContent.includes('!') || lowerContent.includes('wow') || lowerContent.includes('great')) {
      return 'excited';
    }
    if (lowerContent.includes('confused') || lowerContent.includes('?') || lowerContent.includes('not sure')) {
      return 'uncertain';
    }
    if (lowerContent.includes('frustrated') || lowerContent.includes('annoying') || lowerContent.includes('ugh')) {
      return 'frustrated';
    }
    if (lowerContent.includes('thanks') || lowerContent.includes('helpful') || lowerContent.includes('appreciate')) {
      return 'grateful';
    }
    return 'neutral';
  }

  private extractCurrentTopic(messages: RoomMessage[]): string {
    const recentContent = messages.slice(-5).map(m => m.content).join(' ');
    
    // Simple keyword extraction (in a real implementation, you might use NLP)
    const keywords = recentContent.toLowerCase()
      .split(/\W+/)
      .filter(word => word.length > 3)
      .reduce((acc, word) => {
        acc[word] = (acc[word] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);
    
    const topKeyword = Object.entries(keywords)
      .sort(([,a], [,b]) => b - a)[0];
    
    return topKeyword ? topKeyword[0] : 'general conversation';
  }

  private determineConversationPhase(flow: any[]): ConversationContext['conversationPhase'] {
    const recentTypes = flow.slice(-5).map(f => f.messageType);
    
    if (recentTypes.includes('greeting')) return 'greeting';
    if (recentTypes.filter(t => t === 'question').length >= 2) return 'exploration';
    if (recentTypes.includes('request') || recentTypes.includes('answer')) return 'problem-solving';
    if (recentTypes.includes('joke')) return 'casual-chat';
    return 'deep-discussion';
  }

  private analyzeGroupParticipation(flow: any[], participants: string[]): ConversationContext['groupDynamics'] {
    const speakerCounts = flow.reduce((acc, f) => {
      acc[f.speaker] = (acc[f.speaker] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const activeThreshold = Math.max(2, flow.length / participants.length);
    
    return {
      activeParticipants: Object.entries(speakerCounts)
        .filter(([, count]) => count >= activeThreshold)
        .map(([name]) => name),
      quietParticipants: participants.filter(p => (speakerCounts[p] || 0) < activeThreshold),
      conversationLeaders: Object.entries(speakerCounts)
        .sort(([,a], [,b]) => b - a)
        .slice(0, 2)
        .map(([name]) => name),
      supportiveMembers: flow
        .filter(f => f.messageType === 'answer' || f.emotionalContext === 'grateful')
        .map(f => f.speaker)
    };
  }

  private analyzeCommunicationStyle(messages: RoomMessage[]): UserProfile['communicationStyle'] {
    const content = messages.map(m => m.content).join(' ').toLowerCase();
    const avgLength = content.length / messages.length;
    
    if (content.includes('please') || content.includes('thank you') || avgLength > 100) return 'formal';
    if (content.includes('lol') || content.includes('haha') || content.includes('hey')) return 'casual';
    if (content.includes('function') || content.includes('system') || content.includes('implementation')) return 'technical';
    if (content.includes('!') || content.includes('awesome') || content.includes('love')) return 'friendly';
    return 'direct';
  }

  private analyzeOverallTone(messages: RoomMessage[]): UserProfile['emotionalTone'] {
    const content = messages.map(m => m.content).join(' ').toLowerCase();
    
    const positiveWords = ['good', 'great', 'awesome', 'thanks', 'love', 'happy'];
    const negativeWords = ['bad', 'terrible', 'frustrated', 'annoying', 'hate', 'sad'];
    
    const positiveCount = positiveWords.filter(word => content.includes(word)).length;
    const negativeCount = negativeWords.filter(word => content.includes(word)).length;
    
    if (positiveCount > negativeCount * 2) return 'positive';
    if (negativeCount > positiveCount * 2) return 'negative';
    if (positiveCount > 0 && negativeCount > 0) return 'mixed';
    return 'neutral';
  }

  private extractTopicInterests(messages: RoomMessage[]): string[] {
    // Simple implementation - in reality you'd use more sophisticated NLP
    const content = messages.map(m => m.content).join(' ').toLowerCase();
    const topics = ['technology', 'programming', 'design', 'business', 'education', 'science'];
    
    return topics.filter(topic => content.includes(topic));
  }

  private analyzeRelationships(userName: string, messages: RoomMessage[]): Map<string, 'collaborative' | 'questioning' | 'supportive' | 'neutral'> {
    const relationships = new Map<string, 'collaborative' | 'questioning' | 'supportive' | 'neutral'>();
    
    // This is a simplified implementation
    messages.forEach(msg => {
      if (msg.sender_name !== userName && !msg.is_ai_response) {
        relationships.set(msg.sender_name, 'neutral');
      }
    });
    
    return relationships;
  }

  private findResponseTarget(msg: RoomMessage, recentMessages: RoomMessage[]): string | undefined {
    // Simple implementation - look for names mentioned in the message
    const otherUsers = recentMessages
      .filter(m => m.sender_name !== msg.sender_name && !m.is_ai_response)
      .map(m => m.sender_name);
    
    return otherUsers.find(user => msg.content.toLowerCase().includes(user.toLowerCase()));
  }

  private formatMessagesWithContext(messages: RoomMessage[], context: ConversationContext): Array<{ role: 'user' | 'assistant'; content: string }> {
    return messages.map(msg => ({
      role: msg.is_ai_response ? 'assistant' as const : 'user' as const,
      content: msg.is_ai_response 
        ? msg.content 
        : this.enrichUserMessage(msg, context)
    }));
  }

  private enrichUserMessage(msg: RoomMessage, context: ConversationContext): string {
    const profile = this.userProfiles.get(msg.sender_name);
    const flowEntry = context.conversationFlow.find(f => f.speaker === msg.sender_name);
    
    let enrichedContent = `${msg.sender_name}: ${msg.content}`;
    
    // Add contextual metadata for AI understanding
    if (profile) {
      enrichedContent += ` [${profile.communicationStyle} style, ${profile.emotionalTone} tone]`;
    }
    
    if (flowEntry && flowEntry.respondingTo) {
      enrichedContent += ` [responding to ${flowEntry.respondingTo}]`;
    }
    
    return enrichedContent;
  }

  private formatCurrentMessage(user: string, message: string, context: ConversationContext): string {
    const profile = this.userProfiles.get(user);
    const messageType = this.categorizeMessage(message);
    const emotionalContext = this.analyzeEmotionalContext(message);
    
    let formatted = `${user}: ${message}`;
    
    if (profile) {
      formatted += ` [${profile.communicationStyle} style, ${emotionalContext} emotion, ${messageType} type]`;
    }
    
    return formatted;
  }

  private generateUserProfileInsights(participants: string[]): string {
    return participants.map(participant => {
      const profile = this.userProfiles.get(participant);
      if (!profile) return `**${participant}**: New to conversation`;
      
      return `**${participant}**: ${profile.communicationStyle} communicator, ${profile.emotionalTone} tone, ${profile.messageCount} messages (avg ${Math.round(profile.averageMessageLength)} chars)`;
    }).join('\n');
  }

  private analyzeGroupDynamics(context: ConversationContext): string {
    const { groupDynamics } = context;
    
    return `
**Active Contributors**: ${groupDynamics.activeParticipants.join(', ')} are driving the conversation
**Conversation Leaders**: ${groupDynamics.conversationLeaders.join(', ')} are taking initiative
**Quiet Members**: ${groupDynamics.quietParticipants.length > 0 ? groupDynamics.quietParticipants.join(', ') + ' might benefit from encouragement' : 'Everyone is participating actively'}
**Supportive Members**: ${groupDynamics.supportiveMembers.join(', ')} are being helpful`;
  }

  private analyzeConversationFlow(context: ConversationContext): string {
    const recentFlow = context.conversationFlow.slice(-5);
    const messageTypes = recentFlow.map(f => f.messageType);
    const emotions = recentFlow.map(f => f.emotionalContext);
    
    return `
**Recent Pattern**: ${messageTypes.join(' → ')}
**Emotional Flow**: ${emotions.join(' → ')}
**Current Energy**: ${this.assessConversationEnergy(recentFlow)}`;
  }

  private assessConversationEnergy(flow: any[]): string {
    const emotions = flow.map(f => f.emotionalContext);
    
    if (emotions.includes('excited')) return 'High energy, enthusiastic';
    if (emotions.includes('frustrated')) return 'Tension present, needs resolution';
    if (emotions.includes('uncertain')) return 'Exploratory, seeking clarity';
    if (emotions.includes('grateful')) return 'Positive, collaborative';
    return 'Steady, focused discussion';
  }

  private analyzeCurrentMoment(context: ConversationContext, currentUser: string, currentMessage: string): string {
    const messageType = this.categorizeMessage(currentMessage);
    const profile = this.userProfiles.get(currentUser);
    
    return `${currentUser} just ${messageType === 'question' ? 'asked a question' : 
                                  messageType === 'request' ? 'made a request' :
                                  messageType === 'greeting' ? 'greeted the group' :
                                  'shared their thoughts'}. ${profile ? `This is typical of their ${profile.communicationStyle} style.` : 'They\'re new to the conversation.'}`;
  }

  private recommendResponseApproach(context: ConversationContext, currentUser: string, currentMessage: string): string {
    const messageType = this.categorizeMessage(currentMessage);
    const phase = context.conversationPhase;
    
    if (messageType === 'question') return 'Provide a helpful answer while encouraging others to contribute';
    if (messageType === 'request') return 'Be supportive and offer specific assistance';
    if (messageType === 'greeting') return 'Welcome them warmly and help integrate them into the current topic';
    if (phase === 'problem-solving') return 'Focus on practical solutions and next steps';
    if (context.groupDynamics.quietParticipants.length > 0) return 'Encourage broader participation while addressing the immediate message';
    
    return 'Continue the natural flow while adding value to the discussion';
  }
} 