"""校园项目资料包的来源目录。

官方技术资料与自编项目方法分开标记；本文件不包含课程硬性要求。
SOURCES: (文档 ID, 中文检索标题, 官方 URL, 主题分类)。
GUIDES: key -> (标题, 自编建议正文, 主题分类)。
"""

SOURCES = [
    ('react-components', 'React：组件与界面', 'https://react.dev/learn/your-first-component', 'frontend'),
    ('react-state', 'React：状态管理基础', 'https://react.dev/learn/state-a-components-memory', 'frontend'),
    ('react-thinking', 'React：从设计稿到组件', 'https://react.dev/learn/thinking-in-react', 'frontend'),
    ('react-forms', 'React：受控输入与表单', 'https://react.dev/reference/react-dom/components/input', 'frontend'),
    ('react-sharing-state', 'React：共享状态与状态提升', 'https://react.dev/learn/sharing-state-between-components', 'frontend'),
    ('react-lists', 'React：列表渲染、筛选与稳定 key', 'https://react.dev/learn/rendering-lists', 'frontend'),
    ('react-conditional', 'React：加载、空状态与条件渲染', 'https://react.dev/learn/conditional-rendering', 'frontend'),
    ('react-events', 'React：交互事件与事件传播', 'https://react.dev/learn/responding-to-events', 'frontend'),
    ('react-effects', 'React：Effect 同步、清理与连接管理', 'https://react.dev/learn/synchronizing-with-effects', 'frontend'),
    ('react-no-effect', 'React：避免不必要的 Effect', 'https://react.dev/learn/you-might-not-need-an-effect', 'frontend'),
    ('react-state-reset', 'React：组件状态保留、重置与 key', 'https://react.dev/learn/preserving-and-resetting-state', 'frontend'),
    ('mdn-fetch', 'MDN：使用 Fetch 请求接口', 'https://developer.mozilla.org/zh-CN/docs/Web/API/Fetch_API/Using_Fetch', 'api'),
    ('mdn-validation', 'MDN：客户端表单校验', 'https://developer.mozilla.org/zh-CN/docs/Learn_web_development/Extensions/Forms/Form_validation', 'quality'),
    ('mdn-responsive', 'MDN：响应式设计', 'https://developer.mozilla.org/zh-CN/docs/Learn_web_development/Core/CSS_layout/Responsive_Design', 'layout'),
    ('mdn-storage', 'MDN：浏览器本地存储 localStorage', 'https://developer.mozilla.org/zh-CN/docs/Web/API/Window/localStorage', 'data'),
    ('mdn-abort', 'MDN：AbortController 与取消请求', 'https://developer.mozilla.org/zh-CN/docs/Web/API/AbortController', 'api'),
    ('mdn-sse', 'MDN：服务器发送事件 SSE 与事件流格式', 'https://developer.mozilla.org/zh-CN/docs/Web/API/Server-sent_events/Using_server-sent_events', 'api'),
    ('mdn-cors', 'MDN：跨源资源共享 CORS', 'https://developer.mozilla.org/zh-CN/docs/Web/HTTP/Guides/CORS', 'api'),
    ('mdn-http-status', 'MDN：HTTP 响应状态码与错误处理', 'https://developer.mozilla.org/zh-CN/docs/Web/HTTP/Reference/Status', 'api'),
    ('mdn-promise', 'MDN：Promise 异步操作与错误传播', 'https://developer.mozilla.org/zh-CN/docs/Web/JavaScript/Reference/Global_Objects/Promise', 'frontend'),
    ('mdn-grid', 'MDN：CSS Grid 网格布局基础', 'https://developer.mozilla.org/zh-CN/docs/Web/CSS/Guides/Grid_layout/Basic_concepts', 'layout'),
    ('mdn-flexbox', 'MDN：CSS Flex 弹性布局基础', 'https://developer.mozilla.org/zh-CN/docs/Web/CSS/Guides/Flexible_box_layout/Basic_concepts', 'layout'),
    ('mdn-media-query', 'MDN：CSS 媒体查询与布局断点', 'https://developer.mozilla.org/zh-CN/docs/Web/CSS/Guides/Media_queries/Using', 'layout'),
    ('mdn-form', 'MDN：HTML 表单元素与提交行为', 'https://developer.mozilla.org/zh-CN/docs/Web/HTML/Reference/Elements/form', 'frontend'),
    ('mdn-label', 'MDN：label 表单标签与输入关联', 'https://developer.mozilla.org/zh-CN/docs/Web/HTML/Reference/Elements/label', 'quality'),
    ('mdn-accessibility', 'MDN：语义 HTML、按钮与键盘无障碍', 'https://developer.mozilla.org/zh-CN/docs/Learn_web_development/Core/Accessibility/HTML', 'quality'),
    ('mdn-http-overview', 'MDN：HTTP 请求响应与客户端服务器', 'https://developer.mozilla.org/zh-CN/docs/Web/HTTP/Guides/Overview', 'api'),
    ('vite-start', 'Vite：项目启动与开发命令', 'https://vite.dev/guide/', 'delivery'),
    ('vite-build', 'Vite：生产构建、预览与静态部署', 'https://vite.dev/guide/static-deploy', 'delivery'),
    ('vite-env', 'Vite：环境变量、开发模式与配置', 'https://vite.dev/guide/env-and-mode', 'delivery'),
    ('fastapi-body', 'FastAPI：请求体模型与数据校验', 'https://fastapi.tiangolo.com/zh/tutorial/body/', 'api'),
    ('fastapi-errors', 'FastAPI：HTTPException 与接口错误处理', 'https://fastapi.tiangolo.com/zh/tutorial/handling-errors/', 'api'),
    ('fastapi-sql', 'FastAPI：SQL 数据库与 CRUD 接口', 'https://fastapi.tiangolo.com/zh/tutorial/sql-databases/', 'data'),
    ('fastapi-cors', 'FastAPI：浏览器跨域与 CORS 中间件', 'https://fastapi.tiangolo.com/zh/tutorial/cors/', 'api'),
    ('fastapi-testing', 'FastAPI：TestClient 接口测试', 'https://fastapi.tiangolo.com/zh/tutorial/testing/', 'quality'),
    ('fastapi-modules', 'FastAPI：模块划分与 APIRouter', 'https://fastapi.tiangolo.com/zh/tutorial/bigger-applications/', 'api'),
    ('sqlite-foreignkeys', 'SQLite：外键约束、关联数据与删除行为', 'https://www.sqlite.org/foreignkeys.html', 'data'),
    ('sqlite-transactions', 'SQLite：事务、提交与回滚', 'https://www.sqlite.org/lang_transaction.html', 'data'),
    ('sqlite-indexes', 'SQLite：索引、唯一索引与查询字段', 'https://www.sqlite.org/lang_createindex.html', 'data'),
    ('playwright-practices', 'Playwright：用户行为测试、隔离与稳定定位', 'https://playwright.dev/docs/best-practices', 'quality'),
    ('playwright-assertions', 'Playwright：自动重试断言与页面状态检查', 'https://playwright.dev/docs/test-assertions', 'quality'),
    ('wai-labels', 'W3C WAI：表单可访问标签与说明', 'https://www.w3.org/WAI/tutorials/forms/labels/', 'quality'),
    ('wai-notifications', 'W3C WAI：表单成功、错误与用户通知', 'https://www.w3.org/WAI/tutorials/forms/notifications/', 'quality'),
    ('ollama-stream', 'Ollama：流式数据格式与结束标记', 'https://docs.ollama.com/api/streaming', 'ai'),
    ('ollama-embeddings', 'Ollama：文本向量与批量嵌入接口', 'https://docs.ollama.com/api/embed', 'ai'),
    ('mdn-text-decoder', 'MDN：TextDecoder 增量解码与 stream 选项', 'https://developer.mozilla.org/zh-CN/docs/Web/API/TextDecoder/decode', 'api'),
    ('mdn-stream-reader', 'MDN：ReadableStream 获取读取器与流锁', 'https://developer.mozilla.org/zh-CN/docs/Web/API/ReadableStream/getReader', 'api'),
    ('mdn-decoder-stream', 'MDN：TextDecoderStream 将 UTF-8 字节流转为文本流', 'https://developer.mozilla.org/zh-CN/docs/Web/API/TextDecoderStream', 'api'),
    ('mdn-reader-read', 'MDN：reader.read 分块、done 与读取错误', 'https://developer.mozilla.org/zh-CN/docs/Web/API/ReadableStreamDefaultReader/read', 'api'),
    ('mdn-try-catch', 'MDN：try catch finally 异常与清理', 'https://developer.mozilla.org/zh-CN/docs/Web/JavaScript/Reference/Statements/try...catch', 'frontend'),
]

CATEGORY_LABELS = {
    'frontend': '前端组件与状态',
    'layout': '布局与响应式',
    'api': '接口与通信',
    'data': '数据与持久化',
    'quality': '测试与可用性',
    'delivery': '构建与交付',
    'ai': 'AI 与检索',
    'planning': '项目规划方法',
}

GUIDES = {
    'scope': (
        '最小可演示版本：范围选择',
        '''【项目方法建议，非教师评分规则】
最小可演示版本应完成一条端到端用户流程，先证明核心问题能被解决，再增加功能。先写用户是谁、想完成什么、成功时能看到什么；用这些信息判断哪些功能必须进入本次范围。
范围可分“本次必须完成、条件允许再做、明确不做”。其中“本次必须完成”包含学生选择的核心流程，不等于教师硬性要求。只有老师原文明确写出的内容才可标记为课程要求。登录、地图、聊天、后台管理不能因常见就自动成为必做项。
校园失物招领示例可先做列表、组合筛选、发布表单、详情和认领状态。先选择数据保存方式，再把流程接通；即时聊天和复杂推荐可放入后续。技术路线要说明选择理由及限制。
计划中应列出交付物、未完成的假设和验证方式。时间不足时优先减少独立功能，保留校验、错误提示与可演示闭环；不要把所有功能都压缩成没有缓冲的乐观工期。''',
        'planning',
    ),
    'acceptance': (
        '任务拆解与可观察的验收标准',
        '''【项目方法建议，非教师评分规则】
把“完成前端”“完善系统”拆为可单独操作和验证的小任务。每项任务记录标题、具体工作、依赖、优先级、产出和验收标准。以能够检查的用户行为描述完成状态，不用“效果良好”代替证据。
发布表单任务的标准可以是：必填项缺失时阻止提交并指出字段；输入有效时只创建一条记录；提交失败保留原输入；提交成功后列表可见；刷新后按项目约定恢复。列表任务可以验证组合筛选、无结果提示及状态切换。
验收标准与测试用例相关但不必重复代码实现。一个任务应能够说明“什么输入或操作，会得到什么可见结果”。只有任务实际完成并核对标准后再标记已完成。
教师要求可关联多个任务，任务也可支持多条要求。关联编号仅表示计划覆盖，不能证明功能已经实现，更不能用它计算成绩。未知时间使用相对阶段；工作量估算写明假设与范围。''',
        'planning',
    ),
    'demo': (
        '八分钟项目展示准备清单',
        '''【项目方法建议，时长以实际课程要求为准】
先写出一条观众能理解的故事：使用者遇到什么问题，打开系统后怎样解决，最终留下什么结果。展示依次覆盖背景与目标、概要设计、核心操作、关键技术、验证证据和个人工作。若课程限制八分钟，可为切换和网络等待留出机动时间。
准备可重复使用的示例数据、明确的起始页面和操作顺序。演示发布功能时，让观众看到填写、校验、提交和列表更新；演示 AI 时说明当前资料来源、实际模型调用和结果用途。
提前测试网络、隧道、启动命令、数据库、屏幕字号和导出文件。准备真实完成记录或录屏作为故障备份，明确标注历史结果与回放，不把它们描述成现场生成。
介绍技术时连接触发与行为，例如“连接断开后如何恢复已有记录”，避免只念依赖清单。模型输出与性能数字应有真实记录。最后一次彩排计时，优先删减重复说明而非省略核心流程。''',
        'planning',
    ),
    'review': (
        '方案评审：范围、依据与可行性',
        '''【项目方法建议，非教师评分规则】
评审先读取确认要求、个人约束、规划草稿和已有任务，再提出具体问题。不要为了表现独立而泛泛反对，也不要只说“方案清晰”。每项问题尽量包含受影响内容、原因、证据和可执行修改。
检查是否遗漏明确要求，是否把个人偏好或方法模板升级成教师规定，是否猜测老师的隐含期待。没有截止日期、时间预算或接口能力时，标记待确认；不编造日期、评分权重和高分承诺。
检查核心流程是否闭环、功能范围是否适合资源、先后依赖是否合理、验收标准能否观察，以及异常、加载、空状态和窄屏是否纳入范围。确认依赖接口和数据确实存在；“计划接入”与“已经接入”分开写。
输出少量优先级明确的修改建议。保留尚未解决的风险，不因为生成了结构化 JSON 就宣称通过评审。用户应在完整查看要求覆盖、候选任务和风险后决定是否应用。''',
        'planning',
    ),
    'architecture': (
        '小型 Web 应用：前后端与数据边界',
        '''【项目方法建议，按课程和功能需要选择】
前端组织组件、页面、表单、交互和状态；后端校验输入、执行业务规则、访问数据库及外部服务。浏览器访问统一应用接口，可减少上游地址和认证细节暴露。需要密钥的模型调用放在后端，密钥不进入前端构建产物。
是否采用数据库由确认要求、数据关系和运行方式决定。个人单机应用可评估 SQLite，浏览器内演示可评估 localStorage；两者的共享范围、容量、并发、恢复方式不同，不能把建议称为教师规定。
明确数据主键、项目归属、状态和生命周期；对查询、更新和删除统一检查 project_id。前端校验用于及时提示，后端仍须独立验证输入与业务规则。
使用独立依赖和数据目录，提供配置示例及启动命令。开发服务器可代理接口；生产展示优先统一入口。部署到静态托管不代表它能够访问本机 localhost 或校内模型，网络可达性需要单独验证。''',
        'planning',
    ),
    'plan-changes': (
        '计划版本、变更预览与保留进度',
        '''【项目方法建议，非自动执行授权】
要求变化时先保存新要求，再判断受影响的任务和里程碑。新计划应保留来源版本，应用前比较当前项目简报与计划生成时的简报；已过期计划应重新评审，避免把旧约束带回。
变更预览区分新增、已有、需要修改和暂不处理的项。优先保留已完成任务、原始记录和人工补充，不因重新规划静默重置进度。精确标题相同只能作为去重信号，语义近似的任务仍需用户检查。
候选计划经确认才影响任务。应用过程需要事务保护和重复请求处理，避免连续点击创建两份相同任务。任务去重后还要重映射依赖，不能留下不存在或自指的任务编号。
进度根据真实任务状态计算，只表示计划执行情况，不代表实现质量或课程成绩。将未知日期标记待确认，估算变化写清原因，不通过伪造进度让项目看起来更完整。''',
        'planning',
    ),
    'requirements': (
        '需求确认：区分老师要求、个人约束与建议',
        '''【项目方法建议，不代表具体课程要求】
整理需求时先保留老师原文和来源，再记录解释。每条需求使用独立编号，标明类型：教师明确要求、个人约束、方法建议或待确认。只有已提供并确认的教师原文可以形成课程硬性要求。
“课程允许 React 或 Vue”不表示两者都要用；“评价技术难度”不等于必须使用数据库、微服务或多智能体。没有直接规定登录、上传或后台管理时，应回答原文未明确要求，再根据项目功能讨论是否值得做。
个人技术基础、可用时间、目标用户和偏好技术要由用户填写或确认。AI 提取只能形成候选要求，不可把自己推测的期限、评分比例或学校规则保存成已确认事实。
把要求转为可验证条目，记录相应页面、任务或交付物；检查遗漏、冲突和含义不清的词。关键未知项应尽早确认，非关键未知可使用显式假设推进。要求发生变化后，保留版本并重新检查计划覆盖。''',
        'planning',
    ),
    'dependencies': (
        '任务依赖、去重与可执行顺序',
        '''【项目方法建议，具体顺序依实际方案确定】
任务依赖描述开始或验收某项工作前需要具备的产出。例：接口契约确认先于前后端联调；数据保存能力先于刷新恢复验证；完整功能闭环先于录制正式演示。可以先用明确标注的开发占位并行做界面，但最终验收必须连接真实实现。
每项依赖使用稳定任务编号，不用容易重复的标题作为唯一标识。检查依赖编号存在、任务不依赖自己，并用拓扑检查发现 A 等 B、B 又等 A 的循环。
相同标题、大小写或首尾空格不同的候选任务可能重复。合并时先保留现有状态和人工信息，再把后续依赖映射到保留任务；合并后再检查一次图，防止去重引入自环或悬空节点。
不确定的依赖不要编造；可以记录待确认并让用户决定。优先推进无前置阻塞、价值高且能形成可见结果的小任务，避免所有任务都写为最高优先级。''',
        'planning',
    ),
    'testing': (
        '测试矩阵：正常、边界、异常与状态恢复',
        '''【项目方法建议，非测试数量要求】
从用户流程建立测试矩阵，而非机械地逐行复述实现。每条用例包括前置状态、输入或操作、预期可见结果和验证方式。先覆盖最关键的创建、读取、编辑、状态切换和持久化路径。
正常场景检验成功流程；边界场景检验空输入、长度限制、无结果和重复点击；异常场景检验网络不可用、接口错误、模型中断和格式错误；恢复场景检验刷新、切换项目、历史重读与重试。
有项目隔离时，验证 A 项目的要求和任务不会出现在 B 项目查询或修改中。流式场景验证中文多字节、跨网络分块、结束标记、取消和迟到消息，不只测试一条整段字符串。
单元测试适合纯逻辑与解析；接口测试检查校验和数据变化；浏览器测试检查实际按钮、表单、来源跳转和窄屏。只用模拟模型不能证明真实链路可用；保存少量真实联调结果并说明测量条件。''',
        'planning',
    ),
    'report': (
        '项目报告：用实现与证据说明个人工作',
        '''【项目方法建议，格式以老师模板为准】
先取得实际报告模板和提交要求，再安排内容。常见章节包括背景与目标、需求、概要设计、数据与接口、界面实现、关键技术、测试、使用方法及总结。章节可按模板调整，不虚构老师要求的页数、格式或查重规则。
报告应面向没有读过聊天记录的人：说明项目解决什么问题、用户怎样完成流程、你实现了哪些部分、复用了哪些模型或库。用架构图、数据关系和少量关键代码支撑解释，避免堆积截图与依赖名称。
测试结果必须来自执行记录，明确真实模型与模拟测试的区别；性能数字说明单次或多次、条件和局限。截图展示成功状态，也可用代表性错误处理说明完整性。
保存启动步骤、配置示例、资料来源和复现方法。按老师规定的格式及文件名导出，提交前检查 PDF 字体、图片、页码和链接，不把未实现的功能写成已完成。''',
        'planning',
    ),
    'data-design': (
        '数据设计：实体、项目归属与一致性',
        '''【项目方法建议，按实际功能裁剪】
先列清实体及关系，例如项目、要求、会话、运行、计划和任务。每条记录应有稳定主键，属于某项目的数据需要明确 project_id；来源引用应绑定生成它的那次运行，不能被后续检索覆盖。
定义每个状态的含义和允许的转换，如草稿、候选、已确认，或待开始、进行中、已完成。网络失败不是任务已完成，模型 JSON 合法也不等于计划已通过评审。页面、接口和导出应使用一致的状态解释。
跨多表的计划应用、去重和任务创建应使用事务；失败时不留下半份计划。外键和索引根据关系与查询方式选择，删除项目时说明关联数据如何处理，避免跨项目影响。
数据库文件、索引和日志有各自生命周期。修改表结构要提供兼容迁移，修改嵌入模型需要重建匹配索引。备份和导出避免夹带密码、令牌、无关资料或其他项目运行数据。''',
        'planning',
    ),
    'interaction': (
        '清晰交互：加载、空状态、错误与下一步',
        '''【项目方法建议，非唯一设计标准】
界面应让用户知道当前在哪一步、系统正在做什么、结果是否可操作以及下一步是什么。将确认要求、生成草稿、完成评审、检查候选计划和应用任务分清，不把处理中或未验证文本呈现为最终结果。
空页面给出一个明确入口和示例。加载状态说明实际阶段，不使用虚构百分比。错误反馈保留用户输入，解释是否可重试；重试前检查原运行状态，避免重复生成或重复创建任务。
流式消息绑定会话与运行编号；切换项目后，迟到文本不能写入新会话。用户主动阅读上方内容时停止强制滚到底部；提供停止按钮并区分停止接收和上游计算的实际取消。
使用语义按钮、可见标签、键盘焦点和足够可读的文本，不能只靠颜色表达状态。窄屏折叠辅助面板时仍保留打开来源和关闭抽屉的操作。布局和动效服务于任务，减少无关图表与打断弹窗。''',
        'planning',
    ),
    'stream-boundaries': (
        '流式消息边界排错：字节、文本与应用事件',
        '''【自编工程建议，不是官方原文或教师要求】
排查流式显示时先区分三个层次：网络读取返回字节分块，解码产生文本，协议解析产生应用消息。一包网络数据不等于一个汉字、一行 JSON 或一条 SSE 事件。中文 UTF-8 字符可能跨越两次读取，消息分隔符同样可能跨包。
对 reader.read() 返回的 value 使用持续复用的 TextDecoder。还有后续字节时保留 stream 状态，最后一次解码结束流；或使用 TextDecoderStream 完成字节流到文本流的转换。不要为每个分块重新创建无状态解码器，否则可能提前处理不完整的字符。
解码后的文本仍需累计到缓冲区，再依据实际协议寻找完整消息。SSE 以空行分隔事件，同一事件的多个 data 字段按协议组合；NDJSON 则按完整 JSON 行处理。不要把两种协议混用，也不要看到 reader.done 就假定业务已经成功：业务需要的完成事件或结束标记仍须检查。
用 try/catch/finally 组织读流失败提示与必要清理。遇到取消、网络中断或解析错误，应保留已完成内容并标记未完成状态，避免给用户伪造“完成”。测试时把同一 UTF-8 字节序列按任意长度拆开，覆盖中文跨包、事件分隔符跨包、多消息一包和连接提前结束。
原文依据：https://developer.mozilla.org/zh-CN/docs/Web/API/TextDecoder/decode
https://developer.mozilla.org/zh-CN/docs/Web/API/ReadableStream/getReader
https://developer.mozilla.org/zh-CN/docs/Web/API/TextDecoderStream
https://developer.mozilla.org/zh-CN/docs/Web/API/ReadableStreamDefaultReader/read
https://developer.mozilla.org/zh-CN/docs/Web/API/Server-sent_events/Using_server-sent_events
https://developer.mozilla.org/zh-CN/docs/Web/JavaScript/Reference/Statements/try...catch''',
        'planning',
    ),
}
