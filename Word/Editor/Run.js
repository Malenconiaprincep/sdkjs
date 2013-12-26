/**
 * User: Ilja.Kirillov
 * Date: 03.12.13
 * Time: 18:28
 */

var RunRangesCount         = 0;
var RunRangesElementsCount = 0;
var ParaRangesCount        = 0;

function ParaRun(Document)
{
    this.Id         = g_oIdCounter.Get_NewId();  // Id данного элемента
    this.Type       = para_Run;                  // тип данного элемента
    this.Document   = Document;                  // Ссылка на верхний класс документа
    this.Parent     = undefined;                 // Ссылка на родительский класс
    this.Pr         = new CTextPr();             // Текстовые настройки данного run
    this.Content    = new Array();               // Содержимое данного run
    this.State      = new CParaRunState();       // Положение курсора и селекта в данного run
    this.CompiledPr = new CTextPr();             // Скомпилированные настройки
    this.RecalcInfo = new CParaRunRecalcInfo();  // Флаги для пересчета (там же флаг пересчета стиля)
    this.TextRun    = false;

    this.TextAscent  = 0; // текстовый ascent + linegap
    this.TextDescent = 0; // текстовый descent
    this.TextHeight  = 0; // высота текста
    this.TextAscent2 = 0; // текстовый ascent
    this.Ascent      = 0; // общий ascent
    this.Descent     = 0; // общий descent
    this.YOffset     = 0; // смещение по Y

    this.NeedAddNumbering = false;  // Нужно ли добавлять нумерацию (true - нужно, false - не нужно, первый элемент,
                                    // у которого будет false и будет элемент с нумерацией)

    this.Lines       = new Array(); // Массив CParaRunLine
    this.StartLine   = 0;           // Строка, с которой начинается данный ран

    this.CollaborativeMarks = new Array(); // Массив CParaRunCollaborativeMark

    // Добавляем данный класс в таблицу Id (обязательно в конце конструктора)
    g_oTableId.Add( this, this.Id );
}

ParaRun.prototype =
{
//-----------------------------------------------------------------------------------
// Функции для работы с Id
//-----------------------------------------------------------------------------------
    Set_Id : function(newId)
    {
        g_oTableId.Reset_Id( this, newId, this.Id );
        this.Id = newId;
    },

    Get_Id : function()
    {
        return this.Id;
    },

    Set_Parent : function(Paragraph)
    {
        this.Parent = Paragraph;
    },

    Get_Parent : function()
    {
        return this.Parent;
    },

    Get_Paragraph : function()
    {
        return this.Parent;
    },
//-----------------------------------------------------------------------------------
// Функции пересчета
//-----------------------------------------------------------------------------------

    // Выставляем начальную строку и обнуляем массив строк
    Recalculate_Reset : function(StartLine)
    {
        this.StartLine = StartLine;
        this.Lines     = new Array();
    },

    // Пересчитываем размеры всех элементов
    Recalculate_MeasureContent : function()
    {
        if ( false === this.RecalcInfo.Measure )
            return;

        var Pr = this.Get_CompiledPr(false);
        g_oTextMeasurer.SetTextPr( Pr );
        g_oTextMeasurer.SetFontSlot( fontslot_ASCII );

        var bText   = false;
        var bNoText = false;

        // Запрашиваем текущие метрики шрифта, под TextAscent мы будем понимать ascent + linegap(которые записаны в шрифте)
        this.TextHeight  = g_oTextMeasurer.GetHeight();
        this.TextDescent = Math.abs( g_oTextMeasurer.GetDescender() );
        this.TextAscent  = this.TextHeight - this.TextDescent;
        this.TextAscent2 = g_oTextMeasurer.GetAscender();
        this.YOffset     = Pr.Position;

        var ContentLength = this.Content.length;

        for ( var Pos = 0; Pos < ContentLength; Pos++ )
        {
            var Item = this.Content[Pos];

            if ( ( para_Text === Item.Type && true !== Item.SpaceAfter ) || para_Sym === Item.Type )
                bText = true;
            else
                bNoText = true;

            if ( para_Drawing === Item.Type )
            {
                Item.Parent          = this;
                Item.DocumentContent = this.Parent.Parent;
                Item.DrawingDocument = this.Parent.Parent.DrawingDocument;
            }

            Item.Measure( g_oTextMeasurer, Pr );
        }

        if ( true === bText && true !== bNoText )
            this.TextRun = true;
        else
            this.TextRun = false;

        this.TextRun = false;

        this.RecalcInfo.Recalc  = true;
        this.RecalcInfo.Measure = false;
    },

    Recalculate_Range : function( ParaPr)
    {
        RunRangesCount++;
        // Сначала измеряем элементы (можно вызывать каждый раз, внутри разруливается, чтобы измерялось 1 раз)
        this.Recalculate_MeasureContent();

        var PRS = g_oPRSW;

        var CurLine  = PRS.Line - this.StartLine;
        if ( undefined === this.Lines[CurLine] )
        {
            this.Lines[CurLine] = new CParaRunLine();
        }

        var Para = PRS.Paragraph;

        var RangeStartPos = 0;
        var RangeEndPos   = -1;

        // Вычислим RangeStartPos
        var CurRange = PRS.Range;
        if ( 0 === CurLine )
        {
            if ( this.Lines[0].Ranges[CurRange - 1] instanceof CParaRunRange )
            {
                RangeStartPos = this.Lines[0].Ranges[CurRange - 1].EndPos;
            }
            else
            {
                RangeStartPos = 0;
            }
        }
        else if ( 0 === CurRange )
        {
            var _Line = this.Lines[CurLine - 1];
            RangeStartPos = _Line.Ranges[_Line.Ranges.length - 1].EndPos;
        }
        else
        {
            var _Line = this.Lines[CurLine];
            RangeStartPos = Line.Ranges[CurRange - 1].EndPos;
        }

        var FastRecalc = false;
        if ( true === this.TextRun && false === this.RecalcInfo.Recalc )
        {
            // Отмечаем, что началось слово
            PRS.StartWord = true;

            // При проверке, убирается ли слово, мы должны учитывать ширину предшествующих пробелов.
            var RunLen = this.RecalcInfo.RunLen;

            if ( true !== PRS.Word )
            {
                if ( PRS.X + PRS.SpaceLen + RunLen <= PRS.XEnd )
                {
                    // Отмечаем начало нового слова
                    PRS.Set_LineBreakPos( 0 );
                    PRS.WordLen = RunLen;
                    PRS.Word    = true;
                    FastRecalc  = true;
                }
            }
            else
            {
                if ( PRS.X + PRS.SpaceLen + PRS.WordLen + RunLen <= PRS.XEnd )
                {
                    PRS.WordLen += LetterLen;
                    FastRecalc   = true;
                }
            }
        }

        var ContentLen = this.Content.length;
        if ( true === this.TextRun && true === this.RecalcInfo.Recalc )
        {
            var RunLen = 0;

            for (var Pos = 0; Pos < ContentLen; Pos++)
                RunLen += this.Content[Pos].Width;

            this.RecalcInfo.RunLen = RunLen;
        }

        if ( true === FastRecalc )
        {
            // Пересчитаем метрику строки относительно размера данного текста
            this.Internal_Recalculate_LineMetrics( PRS, LineRule );

            RangeEndPos = ContentLen;
        }
        else //if ( false === FastRecalc )
        {
            var MoveToLBP       = PRS.MoveToLBP;
            var NewRange        = PRS.NewRange;
            var ForceNewPage    = PRS.ForceNewPage;
            var NewPage         = PRS.NewPage;
            var BreakPageLine   = PRS.BreakPageLine;
            var End             = PRS.End;

            var Word            = PRS.Word;
            var StartWord       = PRS.StartWord;
            var FirstItemOnLine = PRS.FirstItemOnLine;
            var EmptyLine       = PRS.EmptyLine;

            var RangesCount     = PRS.RangesCount;

            var SpaceLen        = PRS.SpaceLen;
            var WordLen         = PRS.WordLen;
            var SpacesCount     = PRS.SpacesCount;

            var X               = PRS.X;
            var XEnd            = PRS.XEnd;

            var ParaLine        = PRS.Line;
            var ParaRange       = PRS.Range;

            var LineRule = ParaPr.Spacing.LineRule;

            var Pos = RangeStartPos;

            var UpdateLineMetricsText = false;
            for ( ; Pos < ContentLen; Pos++ )
            {
                RunRangesElementsCount++;
                if ( false === StartWord && true === FirstItemOnLine && Math.abs( XEnd - X ) < 0.001 && RangesCount > 0 )
                {
                    NewRange    = true;
                    RangeEndPos = Pos;
                    break;
                }

                var Item     = this.Content[Pos];
                var ItemType = Item.Type;

                // Проверяем, не нужно ли добавить нумерацию к данному элементу
                if ( true === this.Internal_Recalculate_Numbering( Item, PRS, ParaPr ) )
                    PRS.Set_NumberingPos( Pos, Item );

                switch( Item.Type )
                {
                    case para_Sym:
                    case para_Text:
                    {
                        // Отмечаем, что началось слово
                        StartWord = true;

                        UpdateLineMetricsText = true;

                        // При проверке, убирается ли слово, мы должны учитывать ширину предшествующих пробелов.
                        var LetterLen = Item.Width;
                        if ( true !== Word )
                        {
                            // Слово только началось. Делаем следующее:
                            // 1) Если до него на строке ничего не было и данная строка не
                            //    имеет разрывов, тогда не надо проверять убирается ли слово в строке.
                            // 2) В противном случае, проверяем убирается ли слово в промежутке.

                            // Если слово только началось, и до него на строке ничего не было, и в строке нет разрывов, тогда не надо проверять убирается ли оно на строке.
                            if ( true !== FirstItemOnLine || false === Para.Internal_Check_Ranges(ParaLine, ParaRange) )
                            {
                                if ( X + SpaceLen + LetterLen > XEnd )
                                {
                                    NewRange    = true;
                                    RangeEndPos = Pos;
                                }
                            }

                            if ( true !== NewRange )
                            {
                                // Отмечаем начало нового слова
                                PRS.Set_LineBreakPos( Pos );
                                WordLen = Item.Width;
                                Word    = true;
                            }
                        }
                        else
                        {
                            if ( X + SpaceLen + WordLen + LetterLen > XEnd )
                            {
                                if ( true === FirstItemOnLine )
                                {
                                    // Слово оказалось единственным элементом в промежутке, и, все равно,
                                    // не умещается целиком. Делаем следующее:
                                    //
                                    // 1) Если у нас строка без вырезов, тогда ставим перенос строки на
                                    //    текущей позиции.
                                    // 2) Если у нас строка с вырезом, и данный вырез не последний, тогда
                                    //    ставим перенос внутри строки в начале слова.
                                    // 3) Если у нас строка с вырезом и вырез последний, тогда ставим перенос
                                    //    строки в начале слова.

                                    if ( false === Para.Internal_Check_Ranges(ParaLine, ParaRange)  )
                                    {
                                        // Слово не убирается в отрезке. Переносим слово в следующий отрезок
                                        MoveToLBP = true;
                                        NewRange  = true;
                                    }
                                    else
                                    {
                                        EmptyLine   = false;
                                        X          += WordLen;

                                        // Слово не убирается в отрезке, но, поскольку, слово 1 на строке и отрезок тоже 1,
                                        // делим слово в данном месте
                                        NewRange    = true;
                                        RangeEndPos = Pos;
                                    }
                                }
                                else
                                {
                                    // Слово не убирается в отрезке. Переносим слово в следующий отрезок
                                    MoveToLBP = true;
                                    NewRange  = true;
                                }
                            }

                            if ( true !== NewRange )
                            {
                                // Мы убираемся в пределах данной строки. Прибавляем ширину буквы к ширине слова
                                WordLen += LetterLen;

                                // Если текущий символ с переносом, например, дефис, тогда на нем заканчивается слово
                                if ( true === Item.SpaceAfter )
                                {
                                    // Добавляем длину пробелов до слова и ширину самого слова.
                                    X += SpaceLen + WordLen;

                                    Word            = false;
                                    FirstItemOnLine = false;
                                    EmptyLine       = false;
                                    SpaceLen        = 0;
                                    WordLen         = 0;
                                    SpacesCount     = 0;
                                }
                            }
                        }

                        break;
                    }
                    case para_Space:
                    {
                        FirstItemOnLine = false;

                        if ( true === Word )
                        {
                            // Добавляем длину пробелов до слова + длина самого слова. Не надо проверять
                            // убирается ли слово, мы это проверяем при добавленнии букв.
                            X += SpaceLen + WordLen;

                            Word        = false;
                            EmptyLine   = false;
                            SpaceLen    = 0;
                            WordLen     = 0;
                            SpacesCount = 1;
                        }
                        else
                            SpacesCount++;

                        // На пробеле не делаем перенос. Перенос строки или внутристрочный
                        // перенос делаем при добавлении любого непробельного символа
                        SpaceLen += Item.Width;

                        break;
                    }
                    case para_Drawing:
                    {
                        if ( true === Item.Is_Inline() || true === Para.Parent.Is_DrawingShape() )
                        {
                            if ( true !== Item.Is_Inline() )
                                Item.Set_DrawingType( drawing_Inline );

                            if ( true === StartWord )
                                FirstItemOnLine = false;

                            // Если до этого было слово, тогда не надо проверять убирается ли оно, но если стояли пробелы,
                            // тогда мы их учитываем при проверке убирается ли данный элемент, и добавляем только если
                            // данный элемент убирается
                            if ( true === Word || WordLen > 0 )
                            {
                                // Добавляем длину пробелов до слова + длина самого слова. Не надо проверять
                                // убирается ли слово, мы это проверяем при добавленнии букв.
                                X += SpaceLen + WordLen;

                                Word        = false;
                                EmptyLine   = false;
                                SpaceLen    = 0;
                                WordLen     = 0;
                                SpacesCount = 0;
                            }

                            if ( X + SpaceLen + Item.Width > XEnd && ( false === FirstItemOnLine || false === Para.Internal_Check_Ranges( ParaLine, ParaRange ) ) )
                            {
                                // Автофигура не убирается, ставим перенос перед ней
                                NewRange    = true;
                                RangeEndPos = Pos;
                            }
                            else
                            {
                                // Обновим метрики строки
                                if ( linerule_Exact === ParaPr.Spacing.LineRule )
                                {
                                    if ( PRS.LineAscent < Item.Height )
                                        PRS.LineAscent = Item.Height;
                                }
                                else
                                {
                                    if ( PRS.LineAscent < Item.Height + this.YOffset )
                                        PRS.LineAscent = Item.Height + this.YOffset;

                                    if ( PRS.LineDescent < -this.YOffset )
                                        PRS.LineDescent = -this.YOffset;
                                }

                                // Добавляем длину пробелов до автофигуры
                                X += SpaceLen + Item.Width;

                                FirstItemOnLine = false;
                                EmptyLine       = false;
                            }

                            SpaceLen    = 0;
                            SpacesCount = 0;
                        }
                        else
                        {
                            // TODO: переделать здесь
                            Para.Internal_Recalculate_1_AnchorDrawing();

                            // Основная обработка происходит в Recalculate_Range_Spaces. Здесь обрабатывается единственный случай,
                            // когда после второго пересчета с уже добавленной картинкой оказывается, что место в параграфе, где
                            // идет картинка ушло на следующую страницу. В этом случае мы ставим перенос страницы перед картинкой.

                            var LogicDocument  = Para.Parent;
                            var LDRecalcInfo   = LogicDocument.RecalcInfo;
                            var DrawingObjects = LogicDocument.DrawingObjects;
                            var CurPage        = PRS.Page;

                            if ( true === LDRecalcInfo.Check_FlowObject(Item) && true === LDRecalcInfo.Is_PageBreakBefore() )
                            {
                                LDRecalcInfo.Reset();

                                // Добавляем разрыв страницы. Если это первая страница, тогда ставим разрыв страницы в начале параграфа,
                                // если нет, тогда в начале текущей строки.

                                if ( null != this.Get_DocumentPrev() && true != Para.Parent.Is_TableCellContent() && 0 === CurPage )
                                {
                                    // TODO: Переделать
//                                // Мы должны из соответствующих FlowObjects удалить все Flow-объекты, идущие до этого места в параграфе
//                                for ( var TempPos = StartPos; TempPos < Pos; TempPos++ )
//                                {
//                                    var TempItem = this.Content[TempPos];
//                                    if ( para_Drawing === TempItem.Type && drawing_Anchor === TempItem.DrawingType && true === TempItem.Use_TextWrap() )
//                                    {
//                                        DrawingObjects.removeById( TempItem.PageNum, TempItem.Get_Id() );
//                                    }
//                                }

                                    Para.Pages[CurPage].Set_EndLine( -1 );
                                    if ( 0 === CurLine )
                                    {
                                        Para.Lines[-1] = new CParaLine(0);
                                        Para.Lines[-1].Set_EndPos( -1 );
                                    }

                                    PRS.RecalcResult = recalcresult_NextPage;
                                    return;
                                }
                                else
                                {
                                    if ( ParaLine != Para.Pages[CurPage].FirstLine )
                                    {
                                        this.Pages[CurPage].Set_EndLine( ParaLine - 1 );
                                        if ( 0 === ParaLine )
                                        {
                                            this.Lines[-1] = new CParaLine(0);
                                            this.Lines[-1].Set_EndPos( -1 );
                                        }

                                        PRS.RecalcResult = recalcresult_NextPage;
                                        return;
                                    }
                                    else
                                    {
                                        RangeEndPos = Pos;
                                        NewRange     = true;
                                        ForceNewPage = true;
                                    }
                                }


                                // Если до этого было слово, тогда не надо проверять убирается ли оно
                                if ( true === Word || WordLen > 0 )
                                {
                                    // Добавляем длину пробелов до слова + длина самого слова. Не надо проверять
                                    // убирается ли слово, мы это проверяем при добавленнии букв.
                                    X += SpaceLen + WordLen;

                                    Word        = false;
                                    SpaceLen    = 0;
                                    WordLen     = 0;
                                    SpacesCount = 0;
                                }
                            }
                        }

                        break;
                    }
                    case para_PageNum:
                    {
                        // Если до этого было слово, тогда не надо проверять убирается ли оно, но если стояли пробелы,
                        // тогда мы их учитываем при проверке убирается ли данный элемент, и добавляем только если
                        // данный элемент убирается
                        if ( true === Word || WordLen > 0 )
                        {
                            // Добавляем длину пробелов до слова + длина самого слова. Не надо проверять
                            // убирается ли слово, мы это проверяем при добавленнии букв.
                            X += SpaceLen + WordLen;

                            Word        = false;
                            EmptyLine   = false;
                            SpaceLen    = 0;
                            WordLen     = 0;
                            SpacesCount = 0;
                        }

                        // Если на строке начиналось какое-то слово, тогда данная строка уже не пустая
                        if ( true === StartWord )
                            FirstItemOnLine = false;

                        this.Internal_Recalculate_LineMetrics( PRS, LineRule );

                        if ( X + SpaceLen + Item.Width > XEnd && ( false === FirstItemOnLine || false === Para.Internal_Check_Ranges( ParaLine, ParaRange ) ) )
                        {
                            // Данный элемент не убирается, ставим перенос перед ним
                            NewRange    = true;
                            RangeEndPos = Pos;
                        }
                        else
                        {
                            // Добавляем длину пробелов до слова и ширину данного элемента
                            X += SpaceLen + Item.Width;

                            FirstItemOnLine = false;
                            EmptyLine       = false;
                        }

                        SpaceLen    = 0;
                        SpacesCount = 0;

                        break;
                    }
                    case para_Tab:
                    {
                        // Сначала проверяем, если у нас уже есть таб, которым мы должны рассчитать, тогда высчитываем
                        // его ширину.
                        this.Internal_Recalculate_LastTab(PRS);

                        // Добавляем длину пробелов до слова + длина самого слова. Не надо проверять
                        // убирается ли слово, мы это проверяем при добавленнии букв.
                        X += SpaceLen + WordLen;
                        Word        = false;
                        SpaceLen    = 0;
                        WordLen     = 0;
                        SpacesCount = 0;

                        var NewX = Para.Internal_GetTabPos(X, ParaPr);

                        // Если таб не левый (NewX < 0), значит он не может быть сразу рассчитан, а если левый, тогда
                        // рассчитываем его сразу здесь
                        if ( NewX < 0 )
                        {
                            PRS.LastTab.TabPos = -NewX;
                            PRS.LastTab.Value  = Tab.Value;
                            PRS.LastTab.X      = X;
                            PRS.LastTab.Item   = Item;

                            Item.Width        = 0;
                            Item.WidthVisible = 0;
                        }
                        else
                        {
                            if ( NewX > XEnd && ( false === FirstItemOnLine || false === Para.Internal_Check_Ranges( ParaLine, ParaRange ) ) )
                            {
                                WordLen     = NewX - X;
                                RangeEndPos = Pos;
                                NewRange    = true;
                            }
                            else
                            {
                                Item.Width        = NewX - X;
                                Item.WidthVisible = NewX - X;

                                X = NewX;
                            }
                        }

                        // Если перенос идет по строке, а не из-за обтекания, тогда разрываем перед табом, а если
                        // из-за обтекания, тогда разрываем перед последним словом, идущим перед табом
                        if ( RangesCount === CurRange )
                        {
                            if ( true === StartWord )
                            {
                                FirstItemOnLine = false;
                                EmptyLine       = false;
                            }
                        }

                        // Считаем, что с таба начинается слово
                        PRS.Set_LineBreakPos( Pos );

                        StartWord = true;
                        Word      = true;

                        break;
                    }
                    case para_NewLine:
                    {
                        if ( break_Page === Item.BreakType )
                        {
                            // PageBreak вне самого верхнего документа не надо учитывать, поэтому мы его с радостью удаляем
                            if ( !(Para.Parent instanceof CDocument) )
                            {
                                this.Internal_Content_Remove( Pos );
                                Pos--;
                                break;
                            }

                            NewPage       = true;
                            NewRange      = true;
                            BreakPageLine = true;
                        }
                        else
                        {
                            RangeEndPos = Pos + 1;

                            NewRange  = true;
                            EmptyLine = false;
                        }

                        X += WordLen;

                        if ( true === Word )
                        {
                            EmptyLine   = false;
                            Word        = false;
                            X          += SpaceLen;
                            SpaceLen    = 0;
                            SpacesCount = 0;
                        }

                        break;
                    }
                    case para_End:
                    {
                        if ( true === Word )
                        {
                            FirstItemOnLine = false;
                            EmptyLine       = false;
                        }

                        // false === PRS.ExtendBoundToBottom, потому что это уже делалось для PageBreak
                        if ( false === PRS.ExtendBoundToBottom )
                        {
                            X += WordLen;

                            if ( true === Word )
                            {
                                X += SpaceLen;
                                SpaceLen    = 0;
                                SpacesCount = 0;
                                WordLen     = 0;
                            }

                            this.Internal_Recalculate_LastTab(PRS);
                        }

                        NewRange = true;
                        End      = true;

                        RangeEndPos = Pos + 1;

                        break;
                    }
                }

                if ( true === NewRange )
                    break;
            }

            if ( true === UpdateLineMetricsText )
            {
                // Пересчитаем метрику строки относительно размера данного текста
                this.Internal_Recalculate_LineMetrics( PRS, LineRule );
            }

            PRS.MoveToLBP       = MoveToLBP;
            PRS.NewRange        = NewRange;
            PRS.ForceNewPage    = ForceNewPage;
            PRS.NewPage         = NewPage;
            PRS.BreakPageLine   = BreakPageLine;
            PRS.End             = End;

            PRS.Word            = Word;
            PRS.StartWord       = StartWord;
            PRS.FirstItemOnLine = FirstItemOnLine;
            PRS.EmptyLine       = EmptyLine;

            PRS.SpaceLen        = SpaceLen;
            PRS.WordLen         = WordLen;
            PRS.SpacesCount     = SpacesCount;

            PRS.X               = X;
            PRS.XEnd            = XEnd;

            if ( Pos >= ContentLen )
                RangeEndPos = Pos;
        }

        this.Lines[CurLine].Add_Range( PRS.Range, RangeStartPos, RangeEndPos );

        this.RecalcInfo.Recalc = false;
    },

    Recalculate_Set_RangeEndPos : function(PRS, PRP, Depth)
    {
        var CurLine  = PRS.Line - this.StartLine;
        var CurRange = PRS.Range;
        var CurPos   = PRP.Get(Depth);

        this.Lines[CurLine].Ranges[CurRange].EndPos = CurPos;
    },

    Recalculate_Range_Width : function(PRSC, _CurLine, CurRange)
    {
        var CurLine  = _CurLine - this.StartLine;
        var Range    = this.Lines[CurLine].Ranges[CurRange];
        var StartPos = Range.StartPos;
        var EndPos   = Range.EndPos;

        var NumberingItem = PRSC.Paragraph.Numbering.Item;

        for ( var Pos = StartPos; Pos < EndPos; Pos++ )
        {
            var Item = this.Content[Pos];

            if ( Item === NumberingItem )
                PRSC.Range.W += PRSC.Paragraph.Numbering.WidthVisible;

            switch( Item.Type )
            {
                case para_Sym:
                case para_Text:
                {
                    PRSC.Range.Letters++;

                    if ( true !== PRSC.Word )
                    {
                        PRSC.Word = true;
                        PRSC.Range.Words++;
                    }

                    PRSC.Range.W += Item.Width;
                    PRSC.Range.W += PRSC.SpaceLen;

                    PRSC.SpaceLen = 0;

                    // Пробелы перед первым словом в строке не считаем
                    if ( PRSC.Range.Words > 1 )
                        PRSC.Range.Spaces += PRSC.SpacesCount;
                    else
                        PRSC.Range.SpacesSkip += PRSC.SpacesCount;

                    PRSC.SpacesCount = 0;

                    // Если текущий символ, например, дефис, тогда на нем заканчивается слово
                    if ( true === Item.SpaceAfter )
                        PRSC.Word = false;

                    break;
                }
                case para_Space:
                {
                    if ( true === PRSC.Word )
                    {
                        PRSC.Word        = false;
                        PRSC.SpacesCount = 1;
                        PRSC.SpaceLen    = Item.Width;
                    }
                    else
                    {
                        PRSC.SpacesCount++;
                        PRSC.SpaceLen += Item.Width;
                    }

                    break;
                }
                case para_Drawing:
                {
                    PRSC.Range.Words++;
                    PRSC.Range.W += PRS2.SpaceLen;

                    if ( PRSC.Range.Words > 1 )
                        PRSC.Range.Spaces += PRSC.SpacesCount;
                    else
                        PRSC.Range.SpacesSkip += PRSC.SpacesCount;

                    PRSC.Word        = false;
                    PRSC.SpacesCount = 0;
                    PRSC.SpaceLen    = 0;

                    if ( true === Item.Is_Inline() || true === PRS2.Paragraph.Parent.Is_DrawingShape() )
                        PRSC.Range.W += Item.Width;

                    break;
                }
                case para_PageNum:
                {
                    PRSC.Range.Words++;
                    PRSC.Range.W += PRS2.SpaceLen;

                    if ( PRSC.Range.Words > 1 )
                        PRSC.Range.Spaces += PRSC.SpacesCount;
                    else
                        PRSC.Range.SpacesSkip += PRSC.SpacesCount;

                    PRSC.Word        = false;
                    PRSC.SpacesCount = 0;
                    PRSC.SpaceLen    = 0;

                    PRSC.Range.W += Item.Width;

                    break;
                }
                case para_Tab:
                {
                    PRSC.Range.W += Item.Width;
                    PRSC.Range.W += PRS2.SpaceLen;

                    // Учитываем только слова и пробелы, идущие после последнего таба

                    PRSC.Range.LettersSkip += PRSC.Range.Letters;
                    PRSC.Range.SpacesSkip  += PRSC.Range.Spaces;

                    PRSC.Range.Words   = 0;
                    PRSC.Range.Spaces  = 0;
                    PRSC.Range.Letters = 0;

                    PRSC.SpaceLen    = 0;
                    PRSC.SpacesCount = 0;
                    PRSC.Word        = false;

                    break;
                }

                case para_NewLine:
                {
                    if ( true === PRSC.Word && PRSC.Range.Words > 1 )
                        PRSC.Range.Spaces += PRSC.SpacesCount;
                    else
                        PRSC.Range.SpacesSkip += PRSC.SpacesCount;

                    PRSC.SpacesCount = 0;
                    PRSC.Word        = false;

                    break;
                }
                case para_End:
                {
                    if ( true === PRSC.Word )
                        PRSC.Range.Spaces += PRSC.SpacesCount;

                    break;
                }
            }
        }
    },

    Recalculate_Range_Spaces : function(PRSA, _CurLine, CurRange, CurPage)
    {
        var CurLine = _CurLine - this.StartLine;
        var Range    = this.Lines[CurLine].Ranges[CurRange];
        var StartPos = Range.StartPos;
        var EndPos   = Range.EndPos;

        var NumberingItem = PRSA.Paragraph.Numbering.Item;

        for ( var Pos = StartPos; Pos < EndPos; Pos++ )
        {
            var Item = this.Content[Pos];

            if ( Item === NumberingItem )
                PRSA.X += PRSA.Paragraph.Numbering.WidthVisible;

            switch( Item.Type )
            {
                case para_Sym:
                case para_Text:
                {
                    if ( 0 !== PRSA.LettersSkip )
                    {
                        Item.WidthVisible = Item.Width;
                        PRSA.LettersSkip--;
                    }
                    else
                        Item.WidthVisible = Item.Width + PRSA.JustifyWord;

                    PRSA.X    += Item.WidthVisible;
                    PRSA.LastW = Item.WidthVisible;

                    break;
                }
                case para_Space:
                {
                    if ( 0 !== PRSA.SpacesSkip )
                    {
                        Item.WidthVisible = Item.Width;
                        PRSA.SpacesSkip--;
                    }
                    else if ( 0 !== PRSA.SpacesCounter )
                    {
                        Item.WidthVisible = Item.Width + PRSA.JustifySpace;
                        PRSA.SpacesCounter--;
                    }
                    else
                        Item.WidthVisible = Item.Width;

                    PRSA.X    += Item.WidthVisible;
                    PRSA.LastW = Item.WidthVisible;

                    break;
                }
                case para_Drawing:
                {
                    var Para = PRSA.Paragraph;
                    var DrawingObjects = Para.Parent.DrawingObjects;
                    var PageLimits     = Para.Parent.Get_PageLimits(Para.PageNum + CurPage);
                    var PageFields     = Para.Parent.Get_PageFields(Para.PageNum + CurPage);

                    var ColumnStartX = (0 === CurPage ? Para.X_ColumnStart : Para.Pages[CurPage].X     );
                    var ColumnEndX   = (0 === CurPage ? Para.X_ColumnEnd   : Para.Pages[CurPage].XLimit);

                    var Top_Margin    = Y_Top_Margin;
                    var Bottom_Margin = Y_Bottom_Margin;
                    var Page_H        = Page_Height;

                    if ( true === Para.Parent.Is_TableCellContent() && true == Item.Use_TextWrap() )
                    {
                        Top_Margin    = 0;
                        Bottom_Margin = 0;
                        Page_H        = 0;
                    }

                    if ( true != Item.Use_TextWrap() )
                    {
                        PageFields.X      = X_Left_Field;
                        PageFields.Y      = Y_Top_Field;
                        PageFields.XLimit = X_Right_Field;
                        PageFields.YLimit = Y_Bottom_Field;

                        PageLimits.X = 0;
                        PageLimits.Y = 0;
                        PageLimits.XLimit = Page_Width;
                        PageLimits.YLimit = Page_Height;
                    }

                    if ( true === Item.Is_Inline() || true === Para.Parent.Is_DrawingShape() )
                    {
                        Item.Update_Position( new CParagraphLayout( PRSA.X, PRSA.Y , Para.Get_StartPage_Absolute() + CurPage, PRSA.LastW, ColumnStartX, ColumnEndX, X_Left_Margin, X_Right_Margin, Page_Width, Top_Margin, Bottom_Margin, Page_H, PageFields.X, PageFields.Y, Para.Pages[CurPage].Y + Para.Lines[CurLine].Y - Para.Lines[CurLine].Metrics.Ascent, Para.Pages[CurPage].Y), PageLimits );
                        Item.Reset_SavedPosition();

                        PRSA.X    += Item.WidthVisible;
                        PRSA.LastW = Item.WidthVisible;
                    }
                    else
                    {
                        // У нас Flow-объект. Если он с обтеканием, тогда мы останавливаем пересчет и
                        // запоминаем текущий объект. В функции Internal_Recalculate_2 пересчитываем
                        // его позицию и сообщаем ее внешнему классу.

                        if ( true === Item.Use_TextWrap() )
                        {
                            var LogicDocument = Para.Parent;
                            var LDRecalcInfo  = Para.Parent.RecalcInfo;
                            var Page_abs      = Para.Get_StartPage_Absolute() + CurPage;

                            if ( true === LDRecalcInfo.Can_RecalcObject() )
                            {
                                // Обновляем позицию объекта
                                Item.Update_Position( new CParagraphLayout( PRSA.X, PRSA.Y , Page_abs, PRSA.LastW, ColumnStartX, ColumnEndX, X_Left_Margin, X_Right_Margin, Page_Width, Top_Margin, Bottom_Margin, Page_H, PageFields.X, PageFields.Y, Para.Pages[CurPage].Y + Para.Lines[CurLine].Y - Para.Lines[CurLine].Metrics.Ascent, Para.Pages[CurPage].Y), PageLimits);
                                LDRecalcInfo.Set_FlowObject( Item, 0, recalcresult_NextElement );
                                PRSA.RecalcResult = recalcresult_CurPage;
                                return;
                            }
                            else if ( true === LDRecalcInfo.Check_FlowObject(Item) )
                            {
                                // Если мы находимся с таблице, тогда делаем как Word, не пересчитываем предыдущую страницу,
                                // даже если это необходимо. Такое поведение нужно для точного определения рассчиталась ли
                                // данная страница окончательно или нет. Если у нас будет ветка с переходом на предыдущую страницу,
                                // тогда не рассчитав следующую страницу мы о конечном рассчете текущей страницы не узнаем.

                                // Если данный объект нашли, значит он уже был рассчитан и нам надо проверить номер страницы
                                if ( Item.PageNum === Page_abs )
                                {
                                    // Все нормально, можно продолжить пересчет
                                    LDRecalcInfo.Reset();
                                    Item.Reset_SavedPosition();
                                }
                                else if ( true === Para.Parent.Is_TableCellContent() )
                                {
                                    // Картинка не на нужной странице, но так как это таблица
                                    // мы не персчитываем заново текущую страницу, а не предыдущую

                                    // Обновляем позицию объекта
                                    Item.Update_Position( new CParagraphLayout( PRSA.X, PRSA.Y, Page_abs, PRSA.LastW, ColumnStartX, ColumnEndX, X_Left_Margin, X_Right_Margin, Page_Width, Top_Margin, Bottom_Margin, Page_H, PageFields.X, PageFields.Y, Para.Pages[CurPage].Y + Para.Lines[CurLine].Y - Para.Lines[CurLine].Metrics.Ascent, Para.Pages[CurPage].Y), PageLimits);

                                    LDRecalcInfo.Set_FlowObject( Item, 0, recalcresult_NextElement );
                                    LDRecalcInfo.Set_PageBreakBefore( false );
                                    PRSA.RecalcResult = recalcresult_CurPage;
                                    return;
                                }
                                else
                                {
                                    LDRecalcInfo.Set_PageBreakBefore( true );
                                    DrawingObjects.removeById( Item.PageNum, Item.Get_Id() );
                                    PRSA.RecalcResult = recalcresult_PrevPage;
                                    return;
                                }
                            }
                            else
                            {
                                // Либо данный элемент уже обработан, либо будет обработан в будущем
                            }

                            continue;
                        }
                        else
                        {
                            // Картинка ложится на или под текст, в данном случае пересчет можно спокойно продолжать
                            Item.Update_Position( new CParagraphLayout( PRSA.X, PRSA.Y , Page_abs, PRSA.LastW, ColumnStartX, ColumnEndX, X_Left_Margin, X_Right_Margin, Page_Width, Top_Margin, Bottom_Margin, Page_H, PageFields.X, PageFields.Y, Para.Pages[CurPage].Y + Para.Lines[CurLine].Y - Para.Lines[CurLine].Metrics.Ascent, Para.Pages[CurPage].Y), PageLimits);
                            Item.Reset_SavedPosition();
                        }
                    }


                    break;
                }
                case para_PageNum:
                {
                    PRSA.X    += Item.WidthVisible;
                    PRSA.LastW = Item.WidthVisible;

                    break;
                }
                case para_Tab:
                {
                    PRSA.X += Item.WidthVisible;

                    break;
                }
                case para_End:
                {
                    PRSA.X += Item.Width;

                    break;
                }
                case para_NewLine:
                {
                    PRSA.X += Item.WidthVisible;

                    break;
                }

                    // TODO : Реализовать на уровен Run
//                case para_CommentStart:
//                {
//                    var DocumentComments = editor.WordControl.m_oLogicDocument.Comments;
//
//                    var CommentId = Item.Id;
//                    var CommentY  = this.Pages[CurPage].Y + this.Lines[CurLine].Top;
//                    var CommentH  = this.Lines[CurLine].Bottom - this.Lines[CurLine].Top;
//
//                    DocumentComments.Set_StartInfo( CommentId, this.Get_StartPage_Absolute() + CurPage, X, CommentY, CommentH, this.Id );
//
//                    break;
//                }
//
//                case para_CommentEnd:
//                {
//                    var DocumentComments = editor.WordControl.m_oLogicDocument.Comments;
//
//                    var CommentId = Item.Id;
//                    var CommentY  = this.Pages[CurPage].Y + this.Lines[CurLine].Top;
//                    var CommentH  = this.Lines[CurLine].Bottom - this.Lines[CurLine].Top;
//
//                    DocumentComments.Set_EndInfo( CommentId, this.Get_StartPage_Absolute() + CurPage, X, CommentY, CommentH, this.Id );
//                    break;
//                }
            }
        }
    },

    Internal_Recalculate_Numbering : function(Item, PRS, ParaPr)
    {
        // Если нужно добавить нумерацию и на текущем элементе ее можно добавить, тогда добавляем её
        if ( true === this.NeedAddNumbering && true === Item.Can_AddNumbering() )
        {
            var Para = PRS.Paragraph;
            var NumberingItem = Para.Numbering;
            var NumberingType = Para.Numbering.Type;

            if ( para_Numbering === NumberingType )
            {
                var NumPr = ParaPr.NumPr;
                if ( undefined === NumPr || undefined === NumPr.NumId || 0 === NumPr.NumId || "0" === NumPr.NumId )
                {
                    // Так мы обнуляем все рассчитанные ширины данного элемента
                    NumberingItem.Measure( g_oTextMeasurer, undefined );
                }
                else
                {
                    var Numbering = Para.Parent.Get_Numbering();
                    var NumLvl    = Numbering.Get_AbstractNum( NumPr.NumId ).Lvl[NumPr.Lvl];
                    var NumSuff   = NumLvl.Suff;
                    var NumJc     = NumLvl.Jc;
                    var NumInfo   = Para.Parent.Internal_GetNumInfo( this.Id, NumPr );
                    var NumTextPr = Pr.TextPr.Copy();
                    NumTextPr.Merge( Para.TextPr.Value );
                    NumTextPr.Merge( NumLvl.TextPr );

                    // Здесь измеряется только ширина символов нумерации, без суффикса
                    NumberingItem.Measure( g_oTextMeasurer, Numbering, NumInfo, NumTextPr, NumPr );

                    // При рассчете высоты строки, если у нас параграф со списком, то размер символа
                    // в списке влияет только на высоту строки над Baseline, но не влияет на высоту строки
                    // ниже baseline.
                    if ( LineAscent < NumberingItem.Height )
                        LineAscent = NumberingItem.Height;

                    switch ( NumJc )
                    {
                        case align_Right:
                        {
                            NumberingItem.WidthVisible = 0;
                            break;
                        }
                        case align_Center:
                        {
                            NumberingItem.WidthVisible = NumberingItem.WidthNum / 2;
                            PRS.X                     += NumberingItem.WidthNum / 2;
                            break;
                        }
                        case align_Left:
                        default:
                        {
                            NumberingItem.WidthVisible = NumberingItem.WidthNum;
                            PRS.X                     += NumberingItem.WidthNum;
                            break;
                        }
                    }

                    switch( NumSuff )
                    {
                        case numbering_suff_Nothing:
                        {
                            // Ничего не делаем
                            break;
                        }
                        case numbering_suff_Space:
                        {
                            var OldTextPr = g_oTextMeasurer.GetTextPr();
                            g_oTextMeasurer.SetTextPr( NumTextPr );
                            g_oTextMeasurer.SetFontSlot( fontslot_ASCII );
                            NumberingItem.WidthSuff = g_oTextMeasurer.Measure( " " ).Width;
                            g_oTextMeasurer.SetTextPr( OldTextPr );
                            break;
                        }
                        case numbering_suff_Tab:
                        {
                            var NewX = null;
                            var PageStart = Para.Parent.Get_PageContentStartPos( Para.PageNum + PRS.Page );

                            // Если у данного параграфа есть табы, тогда ищем среди них
                            var TabsCount = ParaPr.Tabs.Get_Count();

                            // Добавим в качестве таба левую границу
                            var TabsPos = new Array();
                            var bCheckLeft = true;
                            for ( var Index = 0; Index < TabsCount; Index++ )
                            {
                                var Tab = ParaPr.Tabs.Get(Index);
                                var TabPos = Tab.Pos + PageStart.X;

                                if ( true === bCheckLeft && TabPos > PageStart.X + ParaPr.Ind.Left )
                                {
                                    TabsPos.push( PageStart.X + ParaPr.Ind.Left );
                                    bCheckLeft = false;
                                }

                                if ( tab_Clear !=  Tab.Value )
                                    TabsPos.push( TabPos );
                            }

                            if ( true === bCheckLeft )
                                TabsPos.push( PageStart.X + ParaPr.Ind.Left );

                            TabsCount++;

                            for ( var Index = 0; Index < TabsCount; Index++ )
                            {
                                var TabPos = TabsPos[Index];

                                if ( X < TabPos )
                                {
                                    NewX = TabPos;
                                    break;
                                }
                            }

                            // Если табов нет, либо их позиции левее текущей позиции ставим таб по умолчанию
                            if ( null === NewX )
                            {
                                if ( X < PageStart.X + ParaPr.Ind.Left )
                                    NewX = PageStart.X + ParaPr.Ind.Left;
                                else
                                {
                                    NewX = this.X;
                                    while ( X >= NewX )
                                        NewX += Default_Tab_Stop;
                                }
                            }

                            NumberingItem.WidthSuff = NewX - PRS.X;

                            break;
                        }
                    }

                    NumberingItem.Width         = NumberingItem.WidthNum;
                    NumberingItem.WidthVisible += NumberingItem.WidthSuff;

                    PRS.X += NumberingItem.WidthSuff;
                }
            }
            else if ( para_PresentationNumbering === NumberingType )
            {
                var Bullet = Para.PresentationPr.Bullet;
                if ( numbering_presentationnumfrmt_None != Bullet.Get_Type() )
                {
                    if ( ParaPr.Ind.FirstLine < 0 )
                        NumberingItem.WidthVisible = Math.max( NumberingItem.Width, Para.X + ParaPr.Ind.Left + ParaPr.Ind.FirstLine - PRS.X, Para.X + ParaPr.Ind.Left - PRS.X );
                    else
                        NumberingItem.WidthVisible = Math.max( Para.X + ParaPr.Ind.Left + NumberingItem.Width - PRS.X, Para.X + ParaPr.Ind.Left + ParaPr.Ind.FirstLine - PRS.X, Para.X + ParaPr.Ind.Left - PRS.X );
                }

                PRS.X += NumberingItem.WidthVisible;
            }

            this.NeedAddNumbering = false;

            return true;
        }

        return false;
    },

    Internal_Recalculate_LineMetrics : function(PRS, SpacingLineRule)
    {
        if ( PRS.LineTextAscent < this.TextAscent )
            PRS.LineTextAscent = this.TextAscent;

        if ( PRS.LineTextAscent2 < this.TextAscent2 )
            PRS.LineTextAscent2 = this.TextAscent2;

        if ( PRS.LineTextDescent < this.TextDescent )
            PRS.LineTextDescent = this.TextDescent;

        if ( linerule_Exact === SpacingLineRule )
        {
            // Смещение не учитывается в метриках строки, когда расстояние между строк точное
            if ( PRS.LineAscent < this.TextAscent )
                PRS.LineAscent = this.TextAscent;

            if ( PRS.LineDescent < this.TextDescent )
                PRS.LineDescent = this.TextDescent;
        }
        else
        {
            if ( PRS.LineAscent < this.TextAscent + this.YOffset  )
                PRS.LineAscent = this.TextAscent + this.YOffset;

            if ( PRS.LineDescent < this.TextDescent - this.YOffset )
                PRS.LineDescent = this.TextDescent - this.YOffset;
        }
    },

    Internal_Recalculate_LastTab : function(PRS)
    {
        if ( -1 !== PRS.LastTab.Value )
        {
            var TempXPos = PRS.X;

            if ( true === PRS.Word || PRS.WordLen > 0 )
                TempXPos += PRS.SpaceLen + PRS.WordLen;

            var TabItem   = PRS.LastTab.Item;
            var TabStartX = PRS.LastTab.X;
            var TabRangeW = TempXPos - TabStartX;
            var TabValue  = PRS.LastTab.Value;
            var TabPos    = PRS.LastTab.TabPos;

            var TabCalcW = 0;
            if ( tab_Right === TabValue )
                TabCalcW = Math.max( TabPos - (TabStartX + TabRangeW), 0 );
            else if ( tab_Center === TabValue )
                TabCalcW = Math.max( TabPos - (TabStartX + TabRangeW / 2), 0 );

            if ( PRS.X + TabCalcW > PRS.XEnd )
                TabCalcW = PRS.XEnd - PRS.X;

            TabItem.Width        = TabCalcW;
            TabItem.WidthVisible = TabCalcW;

            PRS.LastTab.Reset();

            PRS.X += TabCalcW;
        }
    },
//-----------------------------------------------------------------------------------
// Функции отрисовки
//-----------------------------------------------------------------------------------
    Draw_HighLights : function(PDSH)
    {
        var pGraphics = PDSH.Graphics;

        var CurLine   = PDSH.Line - this.StartLine;
        var CurRange  = PDSH.Range;

        var aHigh     = PDSH.High;
        var aColl     = PDSH.Coll;
        var aFind     = PDSH.Find;
        var aComm     = PDSH.Comm;

        var Range    = this.Lines[CurLine].Ranges[CurRange];
        var StartPos = Range.StartPos;
        var EndPos   = Range.EndPos;

        var Para     = PDSH.Paragraph;
        var SearchResults = Para.SearchResults;

        var bDrawFind = PDSH.DrawFind;
        var bDrawColl = PDSH.DrawColl;
        var bDrawComm = PDSH.DrawComm;

        //var CurParaPos = PDSH.CurPos.Copy();
        //var CurDepth   = CurParaPos.Add( 0 );

        var X  = PDSH.X;
        var Y0 = PDSH.Y0;
        var Y1 = PDSH.Y1;

        var bDrawComments = bDrawComm;
        var CommentsFlag  = PDSH.CommentsFlag;

        var HighLight = this.Get_CompiledPr(false).HighLight;

        for ( var Pos = StartPos; Pos < EndPos; Pos++ )
        {
            var Item = this.Content[Pos];

            //CurParaPos.Update( Pos, CurDepth );

            // Определим попадание в поиск и совместное редактирование. Попадание в комментарий определять не надо,
            // т.к. класс CParaRun попадает или не попадает в комментарий целиком.

            var bDrawSearch = false;
//            if ( true === bDrawSearch )
//            {
//                for ( var SId in SearchResults )
//                {
//                    var SResult = SearchResults[SId];
//                    if ( CurParaPos.Compare( SResult.StartPos ) >= 0 && CurParaPos.Compare( SResult.EndPos ) <= 0 )
//                    {
//                        bDrawSearch = true;
//                        break;
//                    }
//                }
//            }

            var nCollaborativeChanges = 0;
            if ( true === bDrawColl )
            {
                var CollCount = this.CollaborativeMarks.length;
                for ( var TempIndex = 0; TempIndex < CollCount; TempIndex++ )
                {
                    var CollMark = this.CollaborativeMarks[TempIndex];
                    if ( CollMark.Pos <= Pos && pararun_CollaborativeMark_Start === CollMark.Type  )
                        nCollaborativeChanges++;
                    else if ( CollMark.Pos <= Pos && pararun_CollaborativeMark_End === CollMark.Type )
                        nCollaborativeChanges--;
                }
            }

//            if ( 0 === CurParaPos.Compare( Para.Numbering.Pos ) )
//            {
//                var NumberingType = Para.Numbering.Type;
//                var NumberingItem = Para.Numbering;
//
//                if ( para_Numbering === NumberingType )
//                {
//                    var NumPr = Pr.ParaPr.NumPr;
//                    if ( undefined === NumPr || undefined === NumPr.NumId || 0 === NumPr.NumId || "0" === NumPr.NumId )
//                    {
//                        // Ничего не делаем
//                    }
//                    else
//                    {
//                        var Numbering = Para.Parent.Get_Numbering();
//                        var NumLvl    = Numbering.Get_AbstractNum( NumPr.NumId ).Lvl[NumPr.Lvl];
//                        var NumJc     = NumLvl.Jc;
//                        var NumTextPr = Para.Get_CompiledPr2(false).TextPr.Copy();
//                        NumTextPr.Merge( Para.TextPr.Value );
//                        NumTextPr.Merge( NumLvl.TextPr );
//
//                        var X_start = X;
//
//                        if ( align_Right === NumJc )
//                            X_start = X - NumberingItem.WidthNum;
//                        else if ( align_Center === NumJc )
//                            X_start = X - NumberingItem.WidthNum / 2;
//
//                        // Если есть выделение текста, рисуем его сначала
//                        if ( highlight_None != NumTextPr.HighLight )
//                            aHigh.Add( Y0, Y1, X_start, X_start + NumberingItem.WidthNum + NumberingItem.WidthSuff, 0, NumTextPr.HighLight.r, NumTextPr.HighLight.g, NumTextPr.HighLight.b );
//
//                        if ( nCollaborativeChanges > 0 )
//                            aColl.Add( Y0, Y1, X_start, X_start + NumberingItem.WidthNum + NumberingItem.WidthSuff, 0, 0, 0, 0 );
//
//                        X += NumberingItem.WidthVisible;
//                    }
//                }
//                else if ( para_PresentationNumbering === NumberingType )
//                {
//                    X += NumberingItem.WidthVisible;
//                }
//            }

            switch( Item.Type )
            {
                case para_PageNum:
                case para_Drawing:
                case para_Tab:
                case para_Text:
                case para_Sym:
                {
                    if ( para_Drawing === Item.Type && drawing_Anchor === Item.DrawingType )
                        break;

                    if ( CommentsFlag != comments_NoComment && true === bDrawComments )
                        aComm.Add( Y0, Y1, X, X + Item.WidthVisible, 0, 0, 0, 0, { Active : CommentsFlag === comments_ActiveComment ? true : false } );
                    else if ( highlight_None != HighLight )
                        aHigh.Add( Y0, Y1, X, X + Item.WidthVisible, 0, HighLight.r, HighLight.g, HighLight.b );

                    if ( true === bDrawSearch )
                        aFind.Add( Y0, Y1, X, X + Item.WidthVisible, 0, 0, 0, 0  );
                    else if ( nCollaborativeChanges > 0 )
                        aColl.Add( Y0, Y1, X, X + Item.WidthVisible, 0, 0, 0, 0  );

                    if ( para_Drawing != Item.Type || drawing_Anchor != Item.DrawingType )
                        X += Item.WidthVisible;

                    break;
                }
                case para_Space:
                {
                    // TODO: Переделать здесь

//                    // Пробелы в конце строки (и строку состоящую из пробелов) не подчеркиваем, не зачеркиваем и не выделяем
//                    if ( Pos >= _Range.StartPos2 && Pos <= _Range.EndPos2 )
//                    {
//                        if ( CommentsFlag != comments_NoComment && bDrawComments )
//                            aComm.Add( Y0, Y1, X, X + Item.WidthVisible, 0, 0, 0, 0, { Active : CommentsFlag === comments_ActiveComment ? true : false } );
//                        else if ( highlight_None != HighLight )
//                            aHigh.Add( Y0, Y1, X, X + Item.WidthVisible, 0, HighLight.r, HighLight.g, HighLight.b );
//                    }

                    if ( CommentsFlag != comments_NoComment && bDrawComments )
                        aComm.Add( Y0, Y1, X, X + Item.WidthVisible, 0, 0, 0, 0, { Active : CommentsFlag === comments_ActiveComment ? true : false } );
                    else if ( highlight_None != HighLight )
                        aHigh.Add( Y0, Y1, X, X + Item.WidthVisible, 0, HighLight.r, HighLight.g, HighLight.b );

                    //-------------------------------------------

                    if ( true === bDrawSearch )
                        aFind.Add( Y0, Y1, X, X + Item.WidthVisible, 0, 0, 0, 0  );
                    else if ( nCollaborativeChanges > 0 )
                        aColl.Add( Y0, Y1, X, X + Item.WidthVisible, 0, 0, 0, 0  );

                    X += Item.WidthVisible;

                    break;
                }
                case para_End:
                {
                    if ( nCollaborativeChanges > 0 )
                        aColl.Add( Y0, Y1, X, X + Item.WidthVisible, 0, 0, 0, 0  );

                    X += Item.Width;
                    break;
                }
                case para_NewLine:
                {
                    X += Item.WidthVisible;
                    break;
                }
            }
        }

        // Обновим позицию X
        PDSH.X = X;
    },

    Draw_Elements : function(PDSE)
    {
        var CurLine  = PDSE.Line - this.StartLine;
        var CurRange = PDSE.Range;

        var Range    = this.Lines[CurLine].Ranges[CurRange];
        var StartPos = Range.StartPos;
        var EndPos   = Range.EndPos;

        //var CurParaPos = PDSE.CurPos.Copy();
       // var CurDepth   = CurParaPos.Add( 0 );
        var Para       = PDSE.Paragraph;

        var pGraphics = PDSE.Graphics;
        var AutoColor = PDSE.AutoColor;

        var X = PDSE.X;
        var Y = PDSE.Y;

        var CurTextPr = this.Get_CompiledPr( false );
        pGraphics.SetTextPr( CurTextPr );

        if ( true === PDSE.VisitedHyperlink )
            pGraphics.b_color1( 128, 0, 151, 255 );
        else if ( true === CurTextPr.Color.Auto )
            pGraphics.b_color1( AutoColor.r, AutoColor.g, AutoColor.b, 255);
        else
            pGraphics.b_color1( CurTextPr.Color.r, CurTextPr.Color.g, CurTextPr.Color.b, 255);

        for ( var Pos = StartPos; Pos < EndPos; Pos++ )
        {
            var Item = this.Content[Pos];

            var TempY = Y;
            switch( CurTextPr.VertAlign )
            {
                case vertalign_SubScript:
                {
                    Y -= vertalign_Koef_Sub * CurTextPr.FontSize * g_dKoef_pt_to_mm;

                    break;
                }
                case vertalign_SuperScript:
                {
                    Y -= vertalign_Koef_Super * CurTextPr.FontSize * g_dKoef_pt_to_mm;

                    break;
                }
            }

            //CurParaPos.Update( Pos, CurDepth );

//            if ( 0 === CurParaPos.Compare( Para.Numbering.Pos ) )
//            {
//                var NumberingItem = Para.Numbering;
//                if ( para_Numbering === Para.Numbering.Type )
//                {
//                    var Pr = Para.Get_CompiledPr2(false);
//                    var NumPr = Pr.ParaPr.NumPr;
//                    if ( undefined === NumPr || undefined === NumPr.NumId || 0 === NumPr.NumId || "0" === NumPr.NumId )
//                    {
//                        // Ничего не делаем
//                    }
//                    else
//                    {
//                        var Numbering = Para.Parent.Get_Numbering();
//                        var NumLvl    = Numbering.Get_AbstractNum( NumPr.NumId ).Lvl[NumPr.Lvl];
//                        var NumSuff   = NumLvl.Suff;
//                        var NumJc     = NumLvl.Jc;
//                        var NumTextPr = Para.Get_CompiledPr2(false).TextPr.Copy();
//
//                        // Word не рисует подчеркивание у символа списка, если оно пришло из настроек для
//                        // символа параграфа.
//
//                        var TextPr_temp = Para.TextPr.Value.Copy();
//                        TextPr_temp.Underline = undefined;
//
//                        NumTextPr.Merge( TextPr_temp );
//                        NumTextPr.Merge( NumLvl.TextPr );
//
//                        var X_start = X;
//
//                        if ( align_Right === NumJc )
//                            X_start = X - NumberingItem.WidthNum;
//                        else if ( align_Center === NumJc )
//                            X_start = X - NumberingItem.WidthNum / 2;
//
//                        if ( true === NumTextPr.Color.Auto )
//                            pGraphics.b_color1( AutoColor.r, AutoColor.g, AutoColor.b, 255);
//                        else
//                            pGraphics.b_color1( NumTextPr.Color.r, NumTextPr.Color.g, NumTextPr.Color.b, 255 );
//
//                        // Рисуется только сам символ нумерации
//                        switch ( NumJc )
//                        {
//                            case align_Right:
//                                NumberingItem.Draw( X - NumberingItem.WidthNum, Y, pGraphics, Numbering, NumTextPr, NumPr );
//                                break;
//
//                            case align_Center:
//                                NumberingItem.Draw( X - NumberingItem.WidthNum / 2, Y, pGraphics, Numbering, NumTextPr, NumPr );
//                                break;
//
//                            case align_Left:
//                            default:
//                                NumberingItem.Draw( X, Y, pGraphics, Numbering, NumTextPr, NumPr );
//                                break;
//                        }
//
//                        if ( true === editor.ShowParaMarks && numbering_suff_Tab === NumSuff )
//                        {
//                            var TempWidth     = NumberingItem.WidthSuff;
//                            var TempRealWidth = 3.143; // ширина символа "стрелка влево" в шрифте Wingding3,10
//
//                            var X1 = X;
//                            switch ( NumJc )
//                            {
//                                case align_Right:
//                                    break;
//
//                                case align_Center:
//                                    X1 += NumberingItem.WidthNum / 2;
//                                    break;
//
//                                case align_Left:
//                                default:
//                                    X1 += NumberingItem.WidthNum;
//                                    break;
//                            }
//
//                            var X0 = TempWidth / 2 - TempRealWidth / 2;
//
//                            pGraphics.SetFont( {FontFamily: { Name : "Wingdings 3", Index : -1 }, FontSize: 10, Italic: false, Bold : false} );
//
//                            if ( X0 > 0 )
//                                pGraphics.FillText2( X1 + X0, Y, String.fromCharCode( tab_Symbol ), 0, TempWidth );
//                            else
//                                pGraphics.FillText2( X1, Y, String.fromCharCode( tab_Symbol ), TempRealWidth - TempWidth, TempWidth );
//                        }
//
//                        if ( true === NumTextPr.Strikeout || true === NumTextPr.Underline )
//                        {
//                            if ( true === NumTextPr.Color.Auto )
//                                pGraphics.p_color( AutoColor.r, AutoColor.g, AutoColor.b, 255);
//                            else
//                                pGraphics.p_color( NumTextPr.Color.r, NumTextPr.Color.g, NumTextPr.Color.b, 255 );
//                        }
//
//                        if ( true === NumTextPr.Strikeout )
//                            pGraphics.drawHorLine(0, (Y - NumTextPr.FontSize * g_dKoef_pt_to_mm * 0.27), X_start, X_start + NumberingItem.WidthNum, (NumTextPr.FontSize / 18) * g_dKoef_pt_to_mm);
//
//                        if ( true === NumTextPr.Underline )
//                            pGraphics.drawHorLine( 0, (Y + this.Lines[CurLine].Metrics.TextDescent * 0.4), X_start, X_start + NumberingItem.WidthNum, (NumTextPr.FontSize / 18) * g_dKoef_pt_to_mm);
//
//
//                        X += NumberingItem.WidthVisible;
//
//                        // Восстановим настройки
//                        pGraphics.SetTextPr( CurTextPr );
//                        if ( true === bVisitedHyperlink )
//                            pGraphics.b_color1( 128, 0, 151, 255 );
//                        else if ( true === CurTextPr.Color.Auto )
//                            pGraphics.b_color1( AutoColor.r, AutoColor.g, AutoColor.b, 255);
//                        else
//                            pGraphics.b_color1( CurTextPr.Color.r, CurTextPr.Color.g, CurTextPr.Color.b, 255);
//                    }
//                }
//                else if ( para_PresentationNumbering === this.Numbering.Type )
//                {
//                    if ( true != Para.IsEmpty() )
//                    {
//                        // Найдем настройки для первого текстового элемента
//                        var FirstTextPr = this.Internal_CalculateTextPr( this.Internal_GetStartPos() );
//
//                        if ( Pr.ParaPr.Ind.FirstLine < 0 )
//                            NumberingItem.Draw( X, Y, pGraphics, FirstTextPr );
//                        else
//                            NumberingItem.Draw( Para.X + Pr.ParaPr.Ind.Left, Y, pGraphics, FirstTextPr );
//                    }
//
//                    X += NumberingItem.WidthVisible;
//                }
//            }

            switch( Item.Type )
            {
                case para_PageNum:
                case para_Drawing:
                case para_Tab:
                case para_Text:
                case para_Sym:
                {
                    if ( para_Drawing != Item.Type || drawing_Anchor != Item.DrawingType )
                    {
                        bFirstLineItem = false;

                        if ( para_PageNum != Item.Type )
                            Item.Draw( X, Y - Item.YOffset, pGraphics );
                        else
                            Item.Draw( X, Y - Item.YOffset, pGraphics, Para.Get_StartPage_Absolute() + CurPage, Pr.ParaPr.Jc );

                        X += Item.WidthVisible;
                    }

                    // Внутри отрисовки инлайн-автофигур могут изменится цвета и шрифт, поэтому восстанавливаем настройки
                    if ( para_Drawing === Item.Type && drawing_Inline === Item.DrawingType )
                    {
                        pGraphics.SetTextPr( CurTextPr );

                        if ( true === CurTextPr.Color.Auto )
                        {
                            pGraphics.b_color1( AutoColor.r, AutoColor.g, AutoColor.b, 255);
                            pGraphics.p_color( AutoColor.r, AutoColor.g, AutoColor.b, 255);
                        }
                        else
                        {
                            pGraphics.b_color1( CurTextPr.Color.r, CurTextPr.Color.g, CurTextPr.Color.b, 255);
                            pGraphics.p_color( CurTextPr.Color.r, CurTextPr.Color.g, CurTextPr.Color.b, 255);
                        }
                    }

                    break;
                }
                case para_Space:
                {
                    Item.Draw( X, Y - Item.YOffset, pGraphics );

                    X += Item.WidthVisible;

                    break;
                }
                case para_End:
                {
                    // Выставляем настройки для символа параграфа
                    var EndTextPr = Para.Get_CompiledPr2( false).TextPr.Copy();
                    EndTextPr.Merge( Para.TextPr.Value );

                    pGraphics.SetTextPr( EndTextPr );

                    if ( true === EndTextPr.Color.Auto )
                        pGraphics.b_color1( AutoColor.r, AutoColor.g, AutoColor.b, 255);
                    else
                        pGraphics.b_color1( EndTextPr.Color.r, EndTextPr.Color.g, EndTextPr.Color.b, 255);

                    bEnd = true;
                    var bEndCell = false;
                    if ( null === Para.Get_DocumentNext() && true === Para.Parent.Is_TableCellContent() )
                        bEndCell = true;

                    Item.Draw( X, Y - Item.YOffset, pGraphics, bEndCell );
                    X += Item.Width;

                    break;
                }
                case para_NewLine:
                {
                    Item.Draw( X, Y - Item.YOffset, pGraphics );
                    X += Item.WidthVisible;
                    break;
                }
            }

            Y = TempY;
        }

        // Обновляем позицию
        PDSE.X = X;
    },

    Draw_Lines : function(PDSL)
    {
        var CurLine  = PDSL.Line - this.StartLine;
        var CurRange = PDSL.Range;

        var Range = this.Lines[CurLine].Ranges[CurRange];

        var X        = PDSL.X;
        var Y        = PDSL.Baseline;
        var UndOff   = PDSL.UnderlineOffset;

        var StartPos = Range.StartPos;
        var EndPos   = Range.EndPos;

        //var CurParaPos = PDSL.CurPos.Copy();
        //var CurDepth   = CurParaPos.Add( 0 );
        var Para       = PDSL.Paragraph;

        var aStrikeout  = PDSL.Strikeout;
        var aDStrikeout = PDSL.DStrikeout;
        var aUnderline  = PDSL.Underline;
        var aSpelling   = PDSL.Spelling;

        var CurTextPr = this.Get_CompiledPr( false );

        var StrikeoutY = Y - CurTextPr.FontSize * g_dKoef_pt_to_mm * 0.27;
        var UnderlineY = Y + UndOff;
        var LineW      = (CurTextPr.FontSize / 18) * g_dKoef_pt_to_mm;

        var AutoColor = PDSL.AutoColor;
        var CurColor = new CDocumentColor( 0, 0, 0, false );
        // Выставляем цвет обводки
        if ( true === PDSL.VisitedHyperlink )
            CurColor.Set( 128, 0, 151, 255 );
        else if ( true === CurTextPr.Color.Auto )
            CurColor.Set( AutoColor.r, AutoColor.g, AutoColor.b );
        else
            CurColor.Set( CurTextPr.Color.r, CurTextPr.Color.g, CurTextPr.Color.b, 255);

        for ( var Pos = StartPos; Pos < EndPos; Pos++ )
        {
           //CurParaPos.Update( Pos, CurDepth );
            var Item = this.Content[Pos];

            // TODO: Нумерация зачеркивается и подчеркивается отдельно в Draw_Elements (неплохо бы сюда перенести)
//            if ( 0 === CurParaPos.Compare( Para.Numbering.Pos ) )
//                X += Para.Numbering.WidthVisible;

            switch( Item.Type )
            {
                case para_End:
                case para_NewLine:
                {
                    X += Item.WidthVisible;

                    break;
                }

                case para_PageNum:
                case para_Drawing:
                case para_Tab:
                case para_Text:
                case para_Sym:
                {
                    if ( para_Drawing != Item.Type || drawing_Anchor != Item.DrawingType )
                    {
                        if ( true === CurTextPr.DStrikeout )
                            aDStrikeout.Add( StrikeoutY, StrikeoutY, X, X + Item.WidthVisible, LineW, CurColor.r, CurColor.g, CurColor.b );
                        else if ( true === CurTextPr.Strikeout )
                            aStrikeout.Add( StrikeoutY, StrikeoutY, X, X + Item.WidthVisible, LineW, CurColor.r, CurColor.g, CurColor.b );

                        if ( true === CurTextPr.Underline )
                            aUnderline.Add( UnderlineY, UnderlineY, X, X + Item.WidthVisible, LineW, CurColor.r, CurColor.g, CurColor.b );

                        // TODO: Переделать орфографию
                        //if ( true === CheckSpelling[Pos] )
                        //    aSpelling.Add( UnderlineY, UnderlineY, X, X + Item.WidthVisible, LineW, 0, 0, 0 );

                        X += Item.WidthVisible;
                    }

                    break;
                }
                case para_Space:
                {
                    // TODO: реализовать через счетчик пробелов в начале и в конце
//                    if ( Pos >= _Range.StartPos2 && Pos <= _Range.EndPos2 )
//                    {
//                        if ( true === CurTextPr.DStrikeout )
//                            aDStrikeout.Add( StrikeoutY, StrikeoutY, X, X + Item.WidthVisible, LineW, CurColor.r, CurColor.g, CurColor.b );
//                        else if ( true === CurTextPr.Strikeout )
//                            aStrikeout.Add( StrikeoutY, StrikeoutY, X, X + Item.WidthVisible, LineW, CurColor.r, CurColor.g, CurColor.b );
//
//                        if ( true === CurTextPr.Underline )
//                            aUnderline.Add( UnderlineY, UnderlineY, X, X + Item.WidthVisible, LineW, CurColor.r, CurColor.g, CurColor.b );
//                    }

                    if ( true === CurTextPr.DStrikeout )
                        aDStrikeout.Add( StrikeoutY, StrikeoutY, X, X + Item.WidthVisible, LineW, CurColor.r, CurColor.g, CurColor.b );
                    else if ( true === CurTextPr.Strikeout )
                        aStrikeout.Add( StrikeoutY, StrikeoutY, X, X + Item.WidthVisible, LineW, CurColor.r, CurColor.g, CurColor.b );

                    if ( true === CurTextPr.Underline )
                        aUnderline.Add( UnderlineY, UnderlineY, X, X + Item.WidthVisible, LineW, CurColor.r, CurColor.g, CurColor.b );

                    //-----------------------------------------------------------------------------------


                    X += Item.WidthVisible;

                    break;
                }
            }
        }

        // Обновляем позицию
        PDSL.X = X;
    },
//-----------------------------------------------------------------------------------
// Функции для работы с настройками текста свойств
//-----------------------------------------------------------------------------------
    Recalc_CompiledPr : function(RecalcMeasure)
    {
        this.RecalcInfo.TextPr  = true;

        // Если изменение какой-то текстовой настройки требует пересчета элементов
        if ( true === RecalcMeasure )
            this.RecalcInfo.Measure = true;
    },

    Get_CompiledPr : function(bCopy)
    {
        if ( true === this.RecalcInfo.TextPr )
        {
            this.CompiledPr = this.Internal_Compile_Pr();
            this.RecalcInfo.TextPr = false;
        }

        if ( false === bCopy )
            return this.CompiledPr;
        else
            return this.CompiledPr.Copy(); // Отдаем копию объекта, чтобы никто не поменял извне настройки стиля
    },

    Internal_Compile_Pr : function ()
    {
        if ( undefined === this.Parent )
        {
            // Сюда мы никогда не должны попадать, но на всякий случай,
            // чтобы не выпадало ошибок сгенерим дефолтовые настройки
            var TextPr = new CTextPr();
            TextPr.Init_Default();
            return new CTextPr();
        }

        // Получим настройки текста, для данного параграфа
        var TextPr = this.Parent.Get_CompiledPr2(false).TextPr.Copy();

        // Если в прямых настройках задан стиль, тогда смержим настройки стиля
        if ( undefined != this.Pr.RStyle )
        {
            var Styles = this.Document.Get_Styles();
            var StyleTextPr = Styles.Get_Pr( this.Pr.RStyle, styletype_Character ).TextPr;
            TextPr.Merge( StyleTextPr );
        }

        // Мержим прямые настройки данного рана
        TextPr.Merge( this.Pr );

        // Для совместимости со старыми версиями запишем FontFamily
        TextPr.FontFamily.Name  = TextPr.RFonts.Ascii.Name;
        TextPr.FontFamily.Index = TextPr.RFonts.Ascii.Index;

        return TextPr;
    },

    // В данной функции мы жестко меняем настройки на те, которые пришли (т.е. полностью удаляем старые)
    Set_Pr : function(TextPr)
    {
        var OldValue = this.Pr;
        this.Pr = Value;

        History.Add( this, { Type : historyitem_ParaRun_TextPr, New : Value, Old : OldValue } );
        this.Recalc_CompiledPr(true);
    },

    // В данной функции мы применяем приходящие настройки поверх старых, т.е. старые не удаляем
    Apply_Pr : function(TextPr)
    {
        if ( undefined != TextPr.Bold )
            this.Set_Bold( TextPr.Bold );

        if ( undefined != TextPr.Italic )
            this.Set_Italic( TextPr.Italic );

        if ( undefined != TextPr.Strikeout )
            this.Set_Strikeout( TextPr.Strikeout );

        if ( undefined != TextPr.Underline )
            this.Set_Underline( TextPr.Underline );

        if ( undefined != TextPr.FontSize )
            this.Set_FontSize( TextPr.FontSize );

        if ( undefined != TextPr.Color )
            this.Set_Color( TextPr.Color );

        if ( undefined != TextPr.VertAlign )
            this.Set_VertAlign( TextPr.VertAlign );

        if ( undefined != TextPr.HighLight )
            this.Set_HighLight( TextPr.HighLight );

        if ( undefined != TextPr.RStyle )
            this.Set_RStyle( TextPr.RStyle );

        if ( undefined != TextPr.Spacing )
            this.Set_Spacing( TextPr.Spacing );

        if ( undefined != TextPr.DStrikeout )
            this.Set_DStrikeout( TextPr.DStrikeout );

        if ( undefined != TextPr.Caps )
            this.Set_Caps( TextPr.Caps );

        if ( undefined != TextPr.SmallCaps )
            this.Set_SmallCaps( TextPr.SmallCaps );

        if ( undefined != TextPr.Position )
            this.Set_Position( TextPr.Position );

        if ( undefined != TextPr.RFonts )
            this.Set_RFonts2( TextPr.RFonts );

        if ( undefined != TextPr.Lang )
            this.Set_Lang( TextPr.Lang );
    },

    Set_Bold : function(Value)
    {
        if ( Value !== this.Pr.Bold )
        {
            var OldValue = this.Pr.Bold;
            this.Pr.Bold = Value;

            History.Add( this, { Type : historyitem_ParaRun_Bold, New : Value, Old : OldValue } );

            this.Recalc_CompiledPr(true);
        }
    },

    Get_Bold : function()
    {
        return this.Get_CompiledPr(false).Bold;
    },

    Set_Italic : function(Value)
    {
        if ( Value !== this.Pr.Italic )
        {
            var OldValue = this.Pr.Italic;
            this.Pr.Italic = Value;

            History.Add( this, { Type : historyitem_ParaRun_Italic, New : Value, Old : OldValue } );

            this.Recalc_CompiledPr( true );
        }
    },

    Get_Italic : function()
    {
        return this.Get_CompiledPr(false).Italic;
    },

    Set_Strikeout : function(Value)
    {
        if ( Value !== this.Pr.Strikeout )
        {
            var OldValue = this.Pr.Strikeout;
            this.Pr.Strikeout = Value;

            History.Add( this, { Type : historyitem_ParaRun_Strikeout, New : Value, Old : OldValue } );

            this.Recalc_CompiledPr( false );
        }
    },

    Get_Strikeout : function()
    {
        return this.Get_CompiledPr(false).Strikeout;
    },

    Set_Underline : function(Value)
    {
        if ( Value !== this.Pr.Underline )
        {
            var OldValue = this.Pr.Underline;
            this.Pr.Underline = Value;

            History.Add( this, { Type : historyitem_ParaRun_Underline, New : Value, Old : OldValue } );

            this.Recalc_CompiledPr( false );
        }
    },

    Get_Underline : function()
    {
        return this.Get_CompiledPr(false).Underline;
    },

    Set_FontSize : function(Value)
    {
        if ( Value !== this.Pr.FontSize )
        {
            var OldValue = this.Pr.FontSize;
            this.Pr.FontSize = Value;

            History.Add( this, { Type : historyitem_ParaRun_FontSize, New : Value, Old : OldValue } );

            this.Recalc_CompiledPr( true );
        }
    },

    Get_FontSize : function()
    {
        return this.Get_CompiledPr(false).FontSize;
    },

    Set_Color : function(Value)
    {
        if ( ( undefined === Value && undefined !== this.Pr.Color ) || ( Value instanceof CDocumentColor && ( undefined === this.Pr.Color || false === Value.Compare(this.Pr.Color) ) ) )
        {
            var OldValue = this.Pr.Color;
            this.Pr.Color = Value;

            History.Add( this, { Type : historyitem_ParaRun_Color, New : Value, Old : OldValue } );

            this.Recalc_CompiledPr( false );
        }
    },

    Get_Color : function()
    {
        return this.Get_CompiledPr(false).Color;
    },

    Set_VertAlign : function(Value)
    {
        if ( Value !== this.Pr.Value )
        {
            var OldValue = this.Pr.VertAlign;
            this.Pr.VertAlign = Value;

            History.Add( this, { Type : historyitem_ParaRun_VertAlign, New : Value, Old : OldValue } );

            this.Recalc_CompiledPr( true );
        }
    },

    Get_VertAlign : function()
    {
        return this.Get_CompiledPr(false).VertAlign;
    },

    Set_HighLight : function(Value)
    {
        var OldValue = this.Pr.HighLight;
        if ( (undefined === Value && undefined !== OldValue) || ( highlight_None === Value && highlight_None !== OldValue ) || ( Value instanceof CDocumentColor && ( undefined === OldValue || highlight_None === OldValue || false === Value.Compare(OldValue) ) ) )
        {
            this.Pr.HighLight = Value;
            History.Add( this, { Type : historyitem_ParaRun_HighLight, New : Value, Old : OldValue } );

            this.Recalc_CompiledPr( false );
        }
    },

    Get_HighLight : function()
    {
        return this.Get_CompiledPr(false).HighLight;
    },

    Set_RStyle : function(Value)
    {
        if ( Value !== this.Pr.RStyle )
        {
            var OldValue = this.Pr.RStyle;
            this.Pr.RStyle = Value;

            History.Add( this, { Type : historyitem_ParaRun_RStyle, New : Value, Old : OldValue } );

            this.Recalc_CompiledPr( true );
        }
    },

    Set_Spacing : function(Value)
    {
        if ( Value !== this.Pr.Value )
        {
            var OldValue = this.Pr.Spacing;
            this.Pr.Spacing = Value;

            History.Add( this, { Type : historyitem_ParaRun_Spacing, New : Value, Old : OldValue } );

            this.Recalc_CompiledPr( true );
        }
    },

    Get_Spacing : function()
    {
        return this.Get_CompiledPr(false).Spacing;
    },

    Set_DStrikeout : function(Value)
    {
        if ( Value !== this.Pr.Value )
        {
            var OldValue = this.Pr.DStrikeout;
            this.Pr.DStrikeout = Value;

            History.Add( this, { Type : historyitem_ParaRun_DStrikeout, New : Value, Old : OldValue } );

            this.Recalc_CompiledPr( false );
        }
    },

    Get_DStrikeout : function()
    {
        return this.Get_CompiledPr(false).DStrikeout;
    },

    Set_Caps : function(Value)
    {
        if ( Value !== this.Pr.Caps )
        {
            var OldValue = this.Pr.Caps;
            this.Pr.Caps = Value;

            History.Add( this, { Type : historyitem_ParaRun_Caps, New : Value, Old : OldValue } );
            this.Recalc_CompiledPr( true );
        }
    },

    Get_Caps : function()
    {
        return this.Get_CompiledPr(false).Caps;
    },

    Set_SmallCaps : function(Value)
    {
        if ( Value !== this.Pr.SmallCaps )
        {
            var OldValue = this.Pr.SmallCaps;
            this.Pr.SmallCaps = Value;

            History.Add( this, { Type : historyitem_ParaRun_SmallCaps, New : Value, Old : OldValue } );
            this.Recalc_CompiledPr( true );
        }
    },

    Get_SmallCaps : function()
    {
        return this.Get_CompiledPr(false).SmallCaps;
    },

    Set_Position : function(Value)
    {
        if ( Value !== this.Pr.Position )
        {
            var OldValue = this.Pr.Position;
            this.Pr.Position = Value;

            History.Add( this, { Type : historyitem_ParaRun_Position, New : Value, Old : OldValue } );
            this.Recalc_CompiledPr( false );
        }
    },

    Get_Position : function()
    {
        return this.Get_CompiledPr(false).Position;
    },

    Set_RFonts : function(Value)
    {
        var OldValue = this.Pr.RFonts;
        this.Pr.RFonts = Value;

        History.Add( this, { Type : historyitem_ParaRun_RFonts, New : Value, Old : OldValue } );

        this.Recalc_CompiledPr( true );
    },

    Get_RFonts : function()
    {
        return this.Get_CompiledPr(false).RFonts;
    },

    Set_RFonts2 : function(RFonts)
    {
        if ( undefined != RFonts )
        {
            if ( undefined != RFonts.Ascii )
                this.Set_RFonts_Ascii( RFonts.Ascii );

            if ( undefined != RFonts.HAnsi )
                this.Set_RFonts_HAnsi( RFonts.HAnsi );

            if ( undefined != RFonts.CS )
                this.Set_RFonts_CS( RFonts.CS );

            if ( undefined != RFonts.EastAsia )
                this.Set_RFonts_EastAsia( RFonts.EastAsia );

            if ( undefined != RFonts.Hint )
                this.Set_RFonts_Hint( RFonts.Hint );
        }
    },

    Set_RFonts_Ascii : function(Value)
    {
        if ( Value !== this.Pr.RFonts.Ascii )
        {
            var OldValue = this.Pr.RFonts.Ascii;
            this.Pr.RFonts.Ascii = Value;

            History.Add( this, { Type : historyitem_ParaRun_RFonts_Ascii, New : Value, Old : OldValue } );
            this.Recalc_CompiledPr(true);
        }
    },

    Set_RFonts_HAnsi : function(Value)
    {
        if ( Value !== this.Pr.RFonts.HAnsi )
        {
            var OldValue = this.Pr.RFonts.HAnsi;
            this.Pr.RFonts.HAnsi = Value;

            History.Add( this, { Type : historyitem_ParaRun_RFonts_HAnsi, New : Value, Old : OldValue } );
            this.Recalc_CompiledPr(true);
        }
    },

    Set_RFonts_CS : function(Value)
    {
        if ( Value !== this.Pr.RFonts.CS )
        {
            var OldValue = this.Pr.RFonts.CS;
            this.Pr.RFonts.CS = Value;

            History.Add( this, { Type : historyitem_ParaRun_RFonts_CS, New : Value, Old : OldValue } );
            this.Recalc_CompiledPr(true);
        }
    },

    Set_RFonts_EastAsia : function(Value)
    {
        if ( Value !== this.Pr.RFonts.EastAsia )
        {
            var OldValue = this.Pr.RFonts.EastAsia;
            this.Pr.RFonts.EastAsia = Value;

            History.Add( this, { Type : historyitem_ParaRun_RFonts_EastAsia, New : Value, Old : OldValue } );
            this.Recalc_CompiledPr(true);
        }
    },

    Set_RFonts_Hint : function(Value)
    {
        if ( Value !== this.Pr.RFonts.Hint )
        {
            var OldValue = this.Pr.RFonts.Hint;
            this.Pr.RFonts.Hint = Value;

            Hstory.Add( this, { Type : historyitem_ParaRun_RFonts_Hint, New : Value, Old : OldValue } );
            this.Recalc_CompiledPr(true);
        }
    },

    Set_Lang : function(Value)
    {
        var OldValue = this.Pr.Lang;

        this.Pr.Lang = new CLang();
        if ( undefined != Value )
            this.Pr.Lang.Set_FromObject( Value );

        History.Add( this, { Type : historyitem_ParaRun_Lang, New : NewValue, Old : OldValue } );
        this.Recalc_CompiledPr(false);
    },

    Set_Lang_Bidi : function(Value)
    {
        if ( Value !== this.Pr.Land.Bidi )
        {
            var OldValue = this.Pr.Lang.Bidi;
            this.Pr.Lang.Bidi = Value;

            History.Add( this, { Type : historyitem_ParaRun_Lang_Bidi, New : Value, Old : OldValue } );
            this.Recalc_CompiledPr(false);
        }
    },

    Set_Lang_EastAsia : function(Value)
    {
        if ( Value !== this.Pr.Lang.EastAsia )
        {
            var OldValue = this.Pr.Lang.EastAsia;
            this.Pr.Lang.EastAsia = Value;

            History.Add( this, { Type : historyitem_ParaRun_Lang_EastAsia, New : Value, Old : OldValue } );
            this.Recalc_CompiledPr(false);
        }
    },

    Set_Lang_Val : function(Value)
    {
        if ( Value !== this.Pr.Lang.Val )
        {
            var OldValue = this.Pr.Lang.Val;
            this.Pr.Lang.Val = Value;

            History.Add( this, { Type : historyitem_ParaRun_Lang_Val, New : Value, Old : OldValue } );
            this.Recalc_CompiledPr(false);
        }
    },

//-----------------------------------------------------------------------------------
// Undo/Redo функции
//-----------------------------------------------------------------------------------
    Undo : function(Data)
    {
        var Type = Data.Type;

        switch ( Type )
        {
        }
    },

    Redo : function(Data)
    {
        var Type = Data.Type;

        switch ( Type )
        {
        }
    }

};

function CParaRunSelection()
{
    this.Use      = false;
    this.StartPos = false;
    this.EndPos   = false;
}

function CParaRunState()
{
    this.Selection  = new CParaRunSelection();
    this.ContentPos = 0;
}

function CParaRunRecalcInfo()
{
    this.TextPr  = true; // Нужно ли пересчитать скомпилированные настройки
    this.Measure = true; // Нужно ли перемерять элементы
    this.Recalc  = true; // Нужно ли пересчитывать (только если текстовый ран)
    this.RunLen  = 0;
}

function CParaRunRange(StartPos, EndPos)
{
    this.StartPos = StartPos; // Начальная позиция в контенте, с которой начинается данный отрезок
    this.EndPos   = EndPos;   // Конечная позиция в контенте, на которой заканчивается данный отрезок (перед которой)
}

function CParaRunLine()
{
    this.Ranges = new Array();
}

CParaRunLine.prototype =
{
    Add_Range : function(RangeIndex, StartPos, EndPos)
    {
        this.Ranges[RangeIndex] = new CParaRunRange( StartPos, EndPos );
    }
};

// Метка о конце или начале изменений пришедших от других соавторов документа
var pararun_CollaborativeMark_Start = 0x00;
var pararun_CollaborativeMark_End   = 0x01;

function CParaRunCollaborativeMark(Pos, Type)
{
    this.Pos  = Pos;
    this.Type = Type;
}