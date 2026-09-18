/*
 * data-bundle.js
 *
 * 브라우저 보안 정책상 file:// 로 index.html을 직접 열면
 * fetch()로 JSON 파일을 불러올 수 없습니다 (CORS 오류).
 *
 * 그래서 실제 콘텐츠는 여전히 data/*.json 파일로 "분리"해서 관리하되,
 * 이 파일은 같은 내용을 window.__TEXTBOOK_BUNDLE__ 객체로도 노출합니다.
 *
 * app.js는 먼저 fetch()를 시도하고, 실패하면(file:// 환경)
 * 이 번들을 자동으로 사용합니다.
 *
 * ⚠️ 새 단원을 추가하거나 기존 단원을 수정할 때는
 *    반드시 이 파일과 data/*.json 파일을 함께 수정해야
 *    서버 환경과 로컬 환경에서 동일한 내용이 보입니다.
 */

window.__TEXTBOOK_BUNDLE__ = {
  "lessons.json": {
    "lessons": [
      {
        "id": 1,
        "title": "第一课",
        "chineseTitle": "中国人的家庭观念",
        "koreanTitle": "중국인의 가족관념",
        "file": "lesson01.json"
      },
      {
        "id": 2,
        "title": "第二课",
        "chineseTitle": "北京的四季",
        "koreanTitle": "베이징의 사계절",
        "file": "lesson02.json"
      },
      {
        "id": 3,
        "title": "第三课",
        "chineseTitle": "中国的饮食文化",
        "koreanTitle": "중국의 음식 문화",
        "file": "lesson03.json"
      }
    ]
  },

  "lesson01.json": {
    "id": 1,
    "title": "第一课",
    "chineseTitle": "中国人的家庭观念",
    "koreanTitle": "중국인의 가족관념",
    "sentences": [
      { "id": "l1s1", "chinese": "中国人的家庭观念和西方人有一些不同。", "pinyin": "Zhōngguórén de jiātíng guānniàn hé xīfāngrén yǒu yìxiē bùtóng.", "translation": "중국인의 가족관념은 서양인과 조금 다르다." },
      { "id": "l1s2", "chinese": "中国人非常重视家庭。", "pinyin": "Zhōngguórén fēicháng zhòngshì jiātíng.", "translation": "중국인은 가족을 매우 중요하게 생각한다." },
      { "id": "l1s3", "chinese": "这是中国传统文化的一个重要部分。", "pinyin": "Zhè shì Zhōngguó chuántǒng wénhuà de yí ge zhòngyào bùfen.", "translation": "이것은 중국 전통문화의 중요한 부분이다." },
      { "id": "l1s4", "chinese": "在中国,家庭成员之间的关系非常紧密。", "pinyin": "Zài Zhōngguó, jiātíng chéngyuán zhījiān de guānxì fēicháng jǐnmì.", "translation": "중국에서는 가족 구성원 사이의 관계가 매우 긴밀하다." },
      { "id": "l1s5", "chinese": "很多中国年轻人毕业以后还和父母住在一起。", "pinyin": "Hěn duō Zhōngguó niánqīngrén bìyè yǐhòu hái hé fùmǔ zhù zài yìqǐ.", "translation": "많은 중국 젊은이들은 졸업 후에도 부모님과 함께 산다." },
      { "id": "l1s6", "chinese": "这种现象在西方国家比较少见。", "pinyin": "Zhè zhǒng xiànxiàng zài xīfāng guójiā bǐjiào shǎojiàn.", "translation": "이런 현상은 서양 국가에서는 비교적 드물다." }
    ],
    "vocabulary": [
      { "word": "家庭", "pinyin": "jiātíng", "partOfSpeech": "명사", "meaning": "가정, 가족", "example": "中国人的家庭观念和西方人有一些不同。" },
      { "word": "观念", "pinyin": "guānniàn", "partOfSpeech": "명사", "meaning": "관념", "example": "中国人的家庭观念和西方人有一些不同。" },
      { "word": "西方", "pinyin": "xīfāng", "partOfSpeech": "명사", "meaning": "서양", "example": "这种现象在西方国家比较少见。" },
      { "word": "重视", "pinyin": "zhòngshì", "partOfSpeech": "동사", "meaning": "중시하다", "example": "中国人非常重视家庭。" },
      { "word": "传统", "pinyin": "chuántǒng", "partOfSpeech": "명사/형용사", "meaning": "전통(적인)", "example": "这是中国传统文化的一个重要部分。" },
      { "word": "文化", "pinyin": "wénhuà", "partOfSpeech": "명사", "meaning": "문화", "example": "这是中国传统文化的一个重要部分。" },
      { "word": "成员", "pinyin": "chéngyuán", "partOfSpeech": "명사", "meaning": "구성원", "example": "在中国,家庭成员之间的关系非常紧密。" },
      { "word": "紧密", "pinyin": "jǐnmì", "partOfSpeech": "형용사", "meaning": "긴밀하다", "example": "在中国,家庭成员之间的关系非常紧密。" },
      { "word": "毕业", "pinyin": "bìyè", "partOfSpeech": "동사", "meaning": "졸업하다", "example": "很多中国年轻人毕业以后还和父母住在一起。" },
      { "word": "现象", "pinyin": "xiànxiàng", "partOfSpeech": "명사", "meaning": "현상", "example": "这种现象在西方国家比较少见。" }
    ],
    "grammar": [
      { "id": "g1", "number": "01", "title": "\"和\" — ~와, ~과", "description": "두 명사나 대상을 연결할 때 사용하는 표현입니다.", "example": "中国人的家庭观念和西方人有一些不同。", "translation": "중국인의 가족관념은 서양인과 조금 다르다." },
      { "id": "g2", "number": "02", "title": "\"非常\" + 동사/형용사 — 매우 ~하다", "description": "정도가 매우 심함을 나타내는 부사로, 동사나 형용사 앞에 놓입니다.", "example": "中国人非常重视家庭。", "translation": "중국인은 가족을 매우 중요하게 생각한다." },
      { "id": "g3", "number": "03", "title": "\"以后\" — ~한 후에", "description": "동사나 시점 뒤에 붙어 그 이후의 시간을 나타냅니다.", "example": "很多中国年轻人毕业以后还和父母住在一起。", "translation": "많은 중국 젊은이들은 졸업 후에도 부모님과 함께 산다." }
    ],
    "quiz": [
      { "id": "q1", "question": "\"家庭\"의 뜻은?", "options": ["학교", "가정", "사회", "회사"], "answerIndex": 1, "explanation": "家庭 = 가정, 가족" },
      { "id": "q2", "question": "\"重视\"의 뜻은?", "options": ["무시하다", "중시하다", "가벼워지다", "관찰하다"], "answerIndex": 1, "explanation": "重视 = 중시하다" },
      { "id": "q3", "question": "\"毕业\"의 뜻은?", "options": ["입학하다", "휴학하다", "졸업하다", "전학하다"], "answerIndex": 2, "explanation": "毕业 = 졸업하다" },
      { "id": "q4", "question": "다음 중 '긴밀하다'라는 뜻을 가진 단어는?", "options": ["紧密", "现象", "传统", "文化"], "answerIndex": 0, "explanation": "紧密(jǐnmì) = 긴밀하다" }
    ]
  },

  "lesson02.json": {
    "id": 2,
    "title": "第二课",
    "chineseTitle": "北京的四季",
    "koreanTitle": "베이징의 사계절",
    "sentences": [
      { "id": "l2s1", "chinese": "北京的四季非常分明。", "pinyin": "Běijīng de sìjì fēicháng fēnmíng.", "translation": "베이징의 사계절은 매우 뚜렷하다." },
      { "id": "l2s2", "chinese": "春天的北京经常刮风。", "pinyin": "Chūntiān de Běijīng jīngcháng guāfēng.", "translation": "봄철 베이징에는 자주 바람이 분다." }
    ],
    "vocabulary": [
      { "word": "四季", "pinyin": "sìjì", "partOfSpeech": "명사", "meaning": "사계절", "example": "北京的四季非常分明。" },
      { "word": "分明", "pinyin": "fēnmíng", "partOfSpeech": "형용사", "meaning": "뚜렷하다, 분명하다", "example": "北京的四季非常分明。" }
    ],
    "grammar": [
      { "id": "g1", "number": "01", "title": "\"经常\" — 자주, 늘", "description": "동작이나 상황이 반복적으로 일어남을 나타내는 부사입니다.", "example": "春天的北京经常刮风。", "translation": "봄철 베이징에는 자주 바람이 분다." }
    ],
    "quiz": [
      { "id": "q1", "question": "\"四季\"의 뜻은?", "options": ["사계절", "날씨", "기온", "계획"], "answerIndex": 0, "explanation": "四季 = 사계절" }
    ]
  },

  "lesson03.json": {
    "id": 3,
    "title": "第三课",
    "chineseTitle": "中国的饮食文化",
    "koreanTitle": "중국의 음식 문화",
    "sentences": [
      { "id": "l3s1", "chinese": "中国的饮食文化历史悠久。", "pinyin": "Zhōngguó de yǐnshí wénhuà lìshǐ yōujiǔ.", "translation": "중국의 음식 문화는 역사가 유구하다." },
      { "id": "l3s2", "chinese": "不同地区的菜系有很大的差别。", "pinyin": "Bùtóng dìqū de càixì yǒu hěn dà de chābié.", "translation": "지역마다 요리 계통에는 큰 차이가 있다." }
    ],
    "vocabulary": [
      { "word": "饮食", "pinyin": "yǐnshí", "partOfSpeech": "명사", "meaning": "음식, 먹고 마시는 것", "example": "中国的饮食文化历史悠久。" },
      { "word": "菜系", "pinyin": "càixì", "partOfSpeech": "명사", "meaning": "요리 계통, 요리 계파", "example": "不同地区的菜系有很大的差别。" }
    ],
    "grammar": [
      { "id": "g1", "number": "01", "title": "\"不同\" + 명사 — 다른 ~", "description": "명사 앞에 놓여 서로 다름을 나타내는 표현입니다.", "example": "不同地区的菜系有很大的差别。", "translation": "지역마다 요리 계통에는 큰 차이가 있다." }
    ],
    "quiz": [
      { "id": "q1", "question": "\"饮食\"의 뜻은?", "options": ["의복", "음식", "주거", "교통"], "answerIndex": 1, "explanation": "饮食 = 음식" }
    ]
  }
};
