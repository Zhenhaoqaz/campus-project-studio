"""Fit optional context around the exact task selection and confirmed requirements."""
from . import db
from .model import ContextTooLong, input_budget


def scoped_prompt(project, instruction, question, evidence, history, scope, max_tokens):
    retained = list(evidence)
    recent = list(history)
    counts = dict(scope)
    counts.update(history_used=len(recent), history_total=len(recent),
                  sources_used=sum(item['id'].startswith('S') for item in retained))
    counts['sources_total'] = counts['sources_used']
    while True:
        context = {
            'project': project,
            'task_scope': counts,
            'evidence': [{key: value for key, value in item.items() if key != 'saved_task'}
                         for item in retained],
        }
        prompt = [
            {'role': 'system', 'content': instruction + '\n资料：' + db.dump(context)},
            *recent,
            {'role': 'user', 'content': question},
        ]
        try:
            budget = input_budget(prompt, None, max_tokens)
            return prompt, retained, {**counts, **budget}
        except ContextTooLong as error:
            if recent:
                recent.pop(0)
                while recent and recent[0]['role'] != 'user':
                    recent.pop(0)
                counts['history_used'] = len(recent)
                continue
            optional = next((index for index in range(len(retained) - 1, -1, -1)
                             if retained[index]['id'].startswith('S')), None)
            if optional is None:
                raise ContextTooLong(
                    f'本轮选了 {scope["used"]} / {scope["total"]} 项任务。'
                    '请缩小任务范围或缩短提问，已确认要求与选中的任务原文会完整保留。'
                ) from error
            retained.pop(optional)
            counts['sources_used'] -= 1
