# State Management System

The state management system provides workflow persistence, replay capabilities, and debugging support with a type-safe, immutable state architecture.

## Components

### StateManager
- Main interface for state management
- Manages workflow and step state immutably
- Provides event-based subscriptions for real-time updates
- Deep freezes state objects for true immutability

### StateStore
- Handles state persistence with event sourcing
- Implements snapshot creation at configurable intervals
- Provides automatic compaction to manage event history
- Supports state replay functionality

### FileStateRepository
- File-based state persistence implementation
- Organizes sessions by date (year/month) for efficient storage
- Implements atomic writes for data integrity
- Maintains session index for fast listing and filtering

### EventBus
- Simple pub/sub event system
- Supports one-time event handlers
- Provides error isolation between handlers
- Used for real-time state change notifications

## Features

- **Immutable State**: All state updates create new objects, preventing accidental mutations
- **Event Sourcing**: Every state change is recorded as an event
- **Snapshots**: Periodic snapshots for efficient state recovery
- **Compaction**: Automatic event history cleanup to manage storage
- **Session Management**: Organized session storage with metadata
- **Replay Support**: Ability to replay workflows from any point
- **Type Safety**: Full TypeScript support with strict types
- **Real-time Updates**: Event-based subscriptions for live monitoring

## Usage

```typescript
import { StateManager, FileStateRepository } from './state';

// Create repository and manager
const repository = new FileStateRepository('.roast/sessions');
const stateManager = new StateManager(repository, {
  snapshotInterval: 10,
  compactionThreshold: 100
});

// Initialize session
const state = await stateManager.initializeSession(workflowConfig, {
  tags: ['production', 'important']
});

// Subscribe to updates
const unsubscribe = stateManager.subscribe('step:updated', (data) => {
  console.log(`Step ${data.stepId} updated:`, data.updates);
});

// Update step state
await stateManager.updateStep(stepId, {
  status: StepStatus.Completed,
  output: result
});

// Get immutable state
const currentState = stateManager.getState();
// currentState is deeply frozen
```

## State Structure

```typescript
interface WorkflowState {
  sessionId: string;
  workflowName: string;
  status: WorkflowStatus;
  steps: StepState[];
  context: Record<string, any>;
  startedAt: Date;
  completedAt?: Date;
  error?: Error;
  metadata: WorkflowMetadata;
}

interface StepState {
  id: string;
  name: string;
  index: number;
  status: StepStatus;
  startedAt: Date;
  completedAt?: Date;
  input: any;
  output?: any;
  error?: ErrorInfo;
  transcript: Message[];
  metadata: Record<string, any>;
}
```

## Session Organization

Sessions are stored in a hierarchical directory structure:
```
.roast/sessions/
├── 2024/
│   ├── 01/
│   │   ├── 20240115_103000_001/
│   │   │   ├── state.json
│   │   │   ├── 000_analyze.json
│   │   │   ├── 001_transform.json
│   │   │   └── snapshots/
│   │   │       └── 1705316400000.json
│   └── 02/
└── index.json
```

## Testing

The state management system includes comprehensive tests covering:
- State immutability
- Event handling
- Snapshot creation
- Compaction logic
- File persistence
- Date serialization/deserialization
- Session filtering and listing

All components are fully tested with 100% code coverage.