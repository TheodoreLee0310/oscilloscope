const KnowledgeBase = (function() {
  const knowledge = [
    {
      category: "系统概述",
      items: [
        {
          keywords: ["系统", "简介", "介绍", "什么是", "概述", "功能"],
          answer: "本系统是基于WebGL的智能示波器交互式虚拟仿真系统，采用Vue.js 2.7.16 + Three.js 0.177.0技术栈构建。系统包含六大功能模块：3D物理仿真、2D波形显示、参数控制、用户交互、校准管理和系统配置。支持浏览器端和Electron桌面应用双模式运行。"
        },
        {
          keywords: ["技术", "技术栈", "框架", "开发"],
          answer: "系统技术栈：Vue.js 2.7.16 + Three.js 0.177.0 + dat.GUI + TWEEN.js + Webpack 5 + Electron。前端采用模块化设计，包含scripts目录下的波形绘制模块、校准逻辑模块等。"
        }
      ]
    },
    {
      category: "2D波形显示",
      items: [
        {
          keywords: ["波形", "类型", "正弦", "方波", "三角", "锯齿", "噪声", "脉冲"],
          answer: "系统支持6种波形类型：正弦波(sine)、方波(square)、三角波(triangle)、锯齿波(sawtooth)、噪声(noise)和脉冲波(pulse)。可通过信号源面板的波形选择按钮切换。"
        },
        {
          keywords: ["频率", "Hz", "调整频率", "改变频率"],
          answer: "频率控制波形的疏密程度，单位为Hz。通过参数设置区的频率输入框或+/-按钮调整，范围0.1-10Hz。频率越高，波形越密集；频率越低，波形越稀疏。"
        },
        {
          keywords: ["幅度", "峰峰值", "Vpp", "电压", "振幅"],
          answer: "峰峰值(Vpp)控制波形的高度，单位为伏特(V)。通过参数设置区的峰峰值输入框调整，范围0.1-10V。幅度越大，波形越高；幅度越小，波形越低。"
        },
        {
          keywords: ["初相位", "相位", "相位差", "偏移"],
          answer: "初相位控制波形的起始位置，单位为度(°)。范围0-360°。相位差用于控制两个通道之间的相位偏移，在同向叠加和垂直叠加模式下尤为重要。"
        },
        {
          keywords: ["通道", "CH1", "CH2", "双通道", "激活"],
          answer: "系统有两个输入通道（通道1和通道2）。通过通道控制按钮激活/关闭。通道1默认蓝色，通道2默认橙色。两个通道可以独立显示，也可以同向叠加或垂直叠加显示。"
        }
      ]
    },
    {
      category: "显示模式",
      items: [
        {
          keywords: ["独立", "独立显示", "分开"],
          answer: "独立显示模式：两个通道的波形分别独立显示在屏幕上下区域，各自有独立的中心线。适合同时观察两个独立信号的波形特征。"
        },
        {
          keywords: ["叠加", "同向叠加", "同向", "叠加显示"],
          answer: "同向叠加模式：两个通道的波形在同一坐标系中叠加显示，Y轴为电压，X轴为时间。需要两个通道都激活才能使用。适合比较两个信号的频率、幅度和相位关系。"
        },
        {
          keywords: ["垂直叠加", "李萨如", "lissajous", "XY模式"],
          answer: "垂直叠加模式（李萨如图）：X轴和Y轴分别对应两个通道的信号，形成闭合的利萨如图形。通过频率比可以判断信号间的频率关系，如1:1形成椭圆，2:1形成8字形等。适合测量频率比和相位差。"
        }
      ]
    },
    {
      category: "自检校准",
      items: [
        {
          keywords: ["校准", "自检", "自检校准", "校准模式"],
          answer: "自检校准是实验的第一步。进入校准模式后，系统提供固定标准方波信号（1Hz, 4Vpp）。通过调整时间微调和电压微调滑块，使波形显示符合标准刻度。校准系数0.85为初始值，调整到1.0表示校准完成。"
        },
        {
          keywords: ["微调", "时间微调", "电压微调", "滑块"],
          answer: "微调滑块用于精确调整波形显示。时间微调控制X轴时基，电压微调控制Y轴垂直灵敏度。滑块范围0.1-2.0，1.0为标准值。在校准模式下通过拖动滑块进行精细调整。"
        }
      ]
    },
    {
      category: "触发系统",
      items: [
        {
          keywords: ["触发", "触发电平", "触发模式", "稳定波形"],
          answer: "触发系统用于稳定波形显示。触发电平范围-5V到5V，设置触发电平可捕获特定幅值的信号。触发模式有auto（自动）、normal（常规）和single（单次）。触发斜率可选上升沿或下降沿。"
        },
        {
          keywords: ["暂停", "运行", "截图", "捕捉"],
          answer: "点击暂停按钮可冻结当前波形显示，此时可进行截图分析。点击运行按钮恢复实时波形更新。暂停时系统会保存当前帧画面。"
        }
      ]
    },
    {
      category: "位置控制",
      items: [
        {
          keywords: ["水平位置", "左右移动", "水平偏移"],
          answer: "水平位置控制波形在X轴方向的偏移，范围-8到8格。通过左右箭头按钮调整，步长0.1格。用于将波形移动到屏幕合适位置进行观察。"
        },
        {
          keywords: ["垂直位置", "上下移动", "垂直偏移"],
          answer: "垂直位置控制波形在Y轴方向的偏移，范围-4到4格。每个通道独立控制，通过上下箭头按钮调整。用于将不同通道的波形分开显示或对齐。"
        }
      ]
    },
    {
      category: "3D内部原理",
      items: [
        {
          keywords: ["3D", "内部", "原理", "电子束", "偏转板"],
          answer: "3D内部原理模式展示示波器的内部结构和工作原理。包含电子枪、垂直偏转板、水平偏转板和荧光屏等组件。通过分解视图可以观察各组件的结构，演示动画展示电子束从发射到成像的完整过程。"
        },
        {
          keywords: ["电子枪", "发射", "加速"],
          answer: "电子枪是阴极射线管的核心部件，负责产生并加速电子束。由加热的阴极和带正电的阳极组成，电子从阴极释放后被阳极加速，形成高速电子束。"
        },
        {
          keywords: ["偏转板", "垂直偏转", "水平偏转"],
          answer: "偏转板是带电平行板，用于控制电子束的偏转。垂直偏转板控制上下偏转，水平偏转板控制左右偏转。通过调整两板之间的电压，可以控制电子束的偏转程度和方向。"
        },
        {
          keywords: ["荧光屏", "显示", "成像"],
          answer: "荧光屏涂有荧光物质，当高速电子束击中时会发光形成可见光点。通过控制电子束的偏转，可以在荧光屏上绘制各种图形和波形。系统模拟了余辉效果和荧光点。"
        }
      ]
    },
    {
      category: "VR寻波",
      items: [
        {
          keywords: ["VR", "寻波", "地形", "地图", "定位"],
          answer: "VR寻波功能通过百度地图定位获取当前位置的地形信息，实时生成对应地形的波形信号。支持6种地形：山脉（锯齿波）、水面（正弦波）、平原（低频正弦波）、森林（噪声波）、峡谷（方波）、深海（三角波）。"
        }
      ]
    },
    {
      category: "图片识别",
      items: [
        {
          keywords: ["图片识别", "图像识别", "上传图片", "AI分析", "识别波形"],
          answer: "图片识别功能支持上传示波器截图进行智能分析。系统会自动识别波形类型、频率、幅度等参数。支持识别同向叠加、垂直叠加（李萨如图）等复杂显示模式。可一键将识别结果应用到示波器。"
        }
      ]
    },
    {
      category: "操作指南",
      items: [
        {
          keywords: ["怎么用", "如何操作", "使用方法", "步骤", "教程"],
          answer: "使用步骤：1.自检校准 - 调整微调滑块使标准方波显示正确；2.标准测量 - 选择信号源、激活通道、设置参数；3.调整显示 - 选择显示模式（独立/同向叠加/垂直叠加）、调整时间电压分度；4.高级功能 - 使用触发系统稳定波形、调整位置参数。"
        },
        {
          keywords: ["快捷键", "键盘", "方向键"],
          answer: "键盘快捷键：左右方向键可调整时间分度、电压分度等参数；在参数输入框中可直接输入数值。鼠标操作：拖动滑块进行微调，点击按钮切换模式。"
        }
      ]
    }
  ];

  function findAnswer(question) {
    const q = question.toLowerCase();
    let bestMatch = null;
    let bestScore = 0;

    for (const category of knowledge) {
      for (const item of category.items) {
        let score = 0;
        for (const keyword of item.keywords) {
          if (q.includes(keyword.toLowerCase())) {
            score += keyword.length;
          }
        }
        if (score > bestScore) {
          bestScore = score;
          bestMatch = { category: category.category, answer: item.answer, score };
        }
      }
    }

    return bestMatch;
  }

  function getRelatedTopics(question) {
    const q = question.toLowerCase();
    const related = [];

    for (const category of knowledge) {
      for (const item of category.items) {
        for (const keyword of item.keywords) {
          if (q.includes(keyword.toLowerCase())) {
            related.push({
              category: category.category,
              keywords: item.keywords.slice(0, 3)
            });
            break;
          }
        }
      }
    }

    return related.slice(0, 3);
  }

  function getAllCategories() {
    return knowledge.map(k => k.category);
  }

  function getKnowledgeByCategory(categoryName) {
    const category = knowledge.find(k => k.category === categoryName);
    return category ? category.items : [];
  }

  return {
    findAnswer,
    getRelatedTopics,
    getAllCategories,
    getKnowledgeByCategory
  };
})();

export default KnowledgeBase;