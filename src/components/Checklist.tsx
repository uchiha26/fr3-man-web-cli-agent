import React from 'react';
import { CheckCircle2, Circle, Clock, ListTodo } from 'lucide-react';

export interface Task {
  id: string;
  title: string;
  status: 'pending' | 'in_progress' | 'done';
}

interface ChecklistProps {
  tasks: Task[];
}

export function Checklist({ tasks }: ChecklistProps) {
  if (!tasks || tasks.length === 0) {
    return (
      <div className="p-4 flex flex-col items-center justify-center h-full text-gray-500 space-y-3">
        <ListTodo className="w-8 h-8 opacity-20" />
        <p className="text-xs text-center">No active tasks.<br/>The agent will create a checklist for complex missions.</p>
      </div>
    );
  }

  return (
    <div className="p-4 h-full overflow-y-auto">
      <div className="flex items-center gap-2 mb-4">
        <ListTodo className="w-4 h-4 text-green-500" />
        <h3 className="text-sm font-semibold text-gray-200 uppercase tracking-wider">Mission Status</h3>
      </div>
      
      <div className="space-y-3">
        {tasks.map((task, index) => (
          <div key={task.id || index} className="flex items-start gap-3 p-3 rounded-lg bg-[#1a1a1a] border border-gray-800">
            <div className="mt-0.5">
              {task.status === 'done' && <CheckCircle2 className="w-4 h-4 text-green-500" />}
              {task.status === 'in_progress' && <Clock className="w-4 h-4 text-yellow-500 animate-pulse" />}
              {task.status === 'pending' && <Circle className="w-4 h-4 text-gray-600" />}
            </div>
            <div className="flex-1">
              <p className={`text-sm ${task.status === 'done' ? 'text-gray-500 line-through' : 'text-gray-300'}`}>
                {task.title}
              </p>
              <span className={`text-[10px] uppercase tracking-wider font-semibold mt-1 block ${
                task.status === 'done' ? 'text-green-500/70' : 
                task.status === 'in_progress' ? 'text-yellow-500/70' : 'text-gray-600'
              }`}>
                {task.status.replace('_', ' ')}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
